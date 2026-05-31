'use strict';
const db      = require('../models');
const multer  = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../utils/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder:    'showbiz/receipts/' + req.user.id,
    public_id: 'receipt_' + Date.now(),
    resource_type: 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
  }),
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).single('receipt');

// ── POST /api/bank-transfers ──────────────────────────────────────────────────
const submitTransfer = async (req, res) => {
  upload(req, res, async (err) => {
    // Only fail on actual upload errors, not missing file
    if (err && err.code !== 'LIMIT_UNEXPECTED_FILE') {
      console.error('[BankTransfer upload error]', err.message);
    }
    try {
      const { amount, bank_name, account_name, reference, booking_id } = req.body;
      // Validate booking_id is a UUID if provided
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validBookingId = booking_id && uuidRegex.test(booking_id) ? booking_id : null;
      if (!amount || !reference)
        return res.status(400).json({ status: 'error', message: 'Amount and reference are required.' });

      // Check duplicate reference
      const existing = await db.BankTransfer.findOne({ where: { reference } });
      if (existing)
        return res.status(400).json({ status: 'error', message: 'This reference has already been submitted.' });

      const transfer = await db.BankTransfer.create({
        user_id:      req.user.id,
        booking_id:   validBookingId,
        amount,
        bank_name,
        account_name,
        reference,
        receipt_url:       req.file?.path       || null,
        receipt_public_id: req.file?.filename   || null,
      });

      require('../utils/email/notifications').onNewBankTransferAdmin(req.user, transfer).catch(console.error);
      return res.status(201).json({ status: 'success', message: 'Transfer submitted. Admin will confirm within 2-4 hours.', data: transfer });
    } catch (err) {
      console.error('[submitTransfer] FULL ERROR:', err);
      return res.status(500).json({ status: 'error', message: 'Failed to submit transfer.' });
    }
  });
};

// ── GET /api/bank-transfers/me ────────────────────────────────────────────────
const getMyTransfers = async (req, res) => {
  try {
    const transfers = await db.BankTransfer.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: { transfers: rows, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) } } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch transfers.' });
  }
};

// ── GET /api/admin/bank-transfers ─────────────────────────────────────────────
const adminList = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;
    const transfers = await db.BankTransfer.findAll({
      where,
      include: [{ model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
      order: [['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: transfers });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch transfers.' });
  }
};

// ── POST /api/admin/bank-transfers/:id/confirm ────────────────────────────────
const adminConfirm = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    // Lock row to prevent two admins confirming simultaneously
    const transfer = await db.BankTransfer.findByPk(req.params.id, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!transfer) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Not found.' }); }
    if (transfer.status === 'confirmed') {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'Already confirmed.' });
    }
    if (transfer.status === 'rejected') {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'Cannot confirm a rejected transfer.' });
    }

    await transfer.update({
      status:       'confirmed',
      confirmed_by: req.user.id,
      confirmed_at: new Date(),
      admin_note:   req.body.note || null,
    }, { transaction: t });

    // Credit wallet (idempotent — safe to call)
    const walletCtrl = require('./wallet.controller');
    await walletCtrl.creditWallet(
      transfer.user_id,
      transfer.amount,
      'Bank transfer confirmed — Ref: ' + transfer.reference,
      'BANK-' + transfer.reference,
      { transfer_id: transfer.id },
      t
    );

    await t.commit();

    // Notify user
    const user = await db.User.findByPk(transfer.user_id);
    if (user) {
      const notify = require('../utils/email/notifications');
      if (notify.onBankTransferConfirmed) {
        notify.onBankTransferConfirmed(user, transfer).catch(console.error);
      }
    }

    try {
      const { createAuditLog } = require('../utils/audit');
      await createAuditLog({ actorId: req.user.id, actorRole: req.user.roles?.[0] || 'admin',
        action: 'bank_transfer.confirmed', entityType: 'BankTransfer', entityId: transfer.id,
        ipAddress: req.ip, newValue: { amount: transfer.amount, reference: transfer.reference } });
    } catch {}
    return res.json({ status: 'success', message: 'Transfer confirmed and wallet credited.' });
  } catch (err) {
    try { await t.rollback(); } catch {}
    console.error('[adminConfirm]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to confirm transfer.' });
  }
};

// ── POST /api/admin/bank-transfers/:id/reject ─────────────────────────────────
const adminReject = async (req, res) => {
  try {
    const { reason } = req.body;
    const transfer = await db.BankTransfer.findByPk(req.params.id);
    if (!transfer) return res.status(404).json({ status: 'error', message: 'Not found.' });

    await transfer.update({
      status:       'rejected',
      admin_note:   reason || 'Transfer rejected',
      confirmed_by: req.user.id,
      confirmed_at: new Date(),
    });

    try {
      const { createAuditLog } = require('../utils/audit');
      await createAuditLog({ actorId: req.user.id, actorRole: req.user.roles?.[0] || 'admin',
        action: 'bank_transfer.rejected', entityType: 'BankTransfer', entityId: transfer.id,
        ipAddress: req.ip, newValue: { reason, reference: transfer.reference } });
    } catch {}
    return res.json({ status: 'success', message: 'Transfer rejected.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to reject.' });
  }
};

module.exports = { submitTransfer, getMyTransfers, adminList, adminConfirm, adminReject };
