const db        = require('../models');
const { v4: uuidv4 } = require('uuid');
const notify    = require('../utils/email/notifications');
const { debitWallet, creditWallet } = require('./wallet.controller');

// ── POST /api/withdrawals — model submits withdrawal request ──────────────────
const createWithdrawal = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { amount, bank_name, account_number, account_name } = req.body;
    if (!amount || !bank_name || !account_number || !account_name)
      return res.status(400).json({ status: 'error', message: 'Amount, bank name, account number and account name are required.' });

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0)
      return res.status(400).json({ status: 'error', message: 'Invalid amount.' });

    if (amt < 1000)
      return res.status(400).json({ status: 'error', message: 'Minimum withdrawal amount is ₦1,000.' });

    // Check wallet balance
    const wallet = await db.Wallet.findOne({ where: { user_id: req.user.id } });
    if (!wallet || parseFloat(wallet.balance) < amt)
      return res.status(400).json({ status: 'error', message: 'Insufficient wallet balance.' });

    // Prevent duplicate pending withdrawal
    const existing = await db.Withdrawal.findOne({
      where: { user_id: req.user.id, status: 'pending' },
      transaction: t,
    });
    if (existing)
      return res.status(409).json({ status: 'error', message: 'You already have a pending withdrawal request. Please wait for it to be processed.' });

    const reference = 'WD_' + uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase();

    // Debit wallet immediately to reserve funds
    await debitWallet(req.user.id, amt, `Withdrawal request - ${bank_name}`, reference, { withdrawal_ref: reference });

    // Create withdrawal record
    const withdrawal = await db.Withdrawal.create({
      id: uuidv4(),
      user_id:        req.user.id,
      amount:         amt,
      bank_name,
      account_number,
      account_name,
      status:         'pending',
      reference,
      wallet_debited: true,
    }, { transaction: t });

    await t.commit();

    // Notify admin
    try {
      const user = await db.User.findByPk(req.user.id);
      await notify.onNewBankTransferAdmin(user, {
        amount: amt,
        reference,
        bank_name,
        account_name,
      });
    } catch {}

    return res.status(201).json({
      status: 'success',
      message: `Withdrawal request of ₦${amt.toLocaleString()} submitted. Admin will process within 1-3 business days.`,
      data: withdrawal,
    });
  } catch (err) {
    await t.rollback();
    console.error('[createWithdrawal]', err.message);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to submit withdrawal.' });
  }
};

// ── GET /api/withdrawals — model lists own withdrawals ────────────────────────
const listWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { count, rows } = await db.Withdrawal.findAndCountAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    return res.json({ status: 'success', data: { withdrawals: rows, total: count } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── GET /api/admin/withdrawals — admin lists all withdrawals ──────────────────
const adminListWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status && status !== 'all') where.status = status;
    const { count, rows } = await db.Withdrawal.findAndCountAll({
      where,
      include: [{ model: db.User, as: 'user', attributes: ['id','first_name','last_name','email'] }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    return res.json({ status: 'success', data: { withdrawals: rows, total: count } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── POST /api/admin/withdrawals/:id/approve — admin approves withdrawal ───────
const approveWithdrawal = async (req, res) => {
  try {
    const withdrawal = await db.Withdrawal.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'user' }],
    });
    if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Not found.' });
    if (withdrawal.status !== 'pending')
      return res.status(400).json({ status: 'error', message: 'Withdrawal is not pending.' });

    await withdrawal.update({
      status:       'approved',
      processed_by: req.user.id,
      processed_at: new Date(),
      admin_note:   req.body?.note || 'Approved by admin.',
    });

    // Log audit
    try {
      await db.AuditLog.create({
        id: uuidv4(), actor_id: req.user.id, actor_role: req.user.roles?.[0],
        action: 'withdrawal.approved', entity_type: 'Withdrawal', entity_id: withdrawal.id,
        ip_address: req.ip,
      });
    } catch {}

    // Notify user
    try {
      if (withdrawal.user) {
        await notify.sendEmail({
          to: withdrawal.user.email,
          subject: '✅ Withdrawal Approved — Showbiz Platform',
          html: `<p>Hi ${withdrawal.user.first_name},</p>
            <p>Your withdrawal request of <strong>₦${parseFloat(withdrawal.amount).toLocaleString()}</strong> has been approved and will be transferred to your ${withdrawal.bank_name || 'registered'} account${withdrawal.account_number ? ' ending in ' + withdrawal.account_number.slice(-4) : ''} within 24 hours.</p>`,
        });
      }
    } catch {}

    appNotify.onWithdrawalReviewed(withdrawal.user_id, true, withdrawal.amount).catch(console.error);
    return res.json({ status: 'success', message: 'Withdrawal approved.' });
  } catch (err) {
    console.error('[approveWithdrawal] FULL STACK:', err.stack);
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── POST /api/admin/withdrawals/:id/reject — admin rejects withdrawal ─────────
const rejectWithdrawal = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const withdrawal = await db.Withdrawal.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'user' }],
      transaction: t,
    });
    if (!withdrawal) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Not found.' }); }
    if (withdrawal.status !== 'pending') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Not pending.' }); }

    const reason = req.body.reason || 'Rejected by admin.';

    await withdrawal.update({
      status:       'rejected',
      processed_by: req.user.id,
      processed_at: new Date(),
      admin_note:   reason,
    }, { transaction: t });

    // Refund wallet
    if (withdrawal.wallet_debited) {
      await creditWallet(
        withdrawal.user_id,
        withdrawal.amount,
        'Withdrawal rejected — refunded',
        'REFUND_' + withdrawal.reference,
        { withdrawal_id: withdrawal.id }
      );
    }

    await t.commit();

    // Notify user
    try {
      if (withdrawal.user) {
        await notify.sendEmail({
          to: withdrawal.user.email,
          subject: '❌ Withdrawal Rejected — Showbiz Platform',
          html: `<p>Hi ${withdrawal.user.first_name},</p>
            <p>Your withdrawal request of <strong>₦${parseFloat(withdrawal.amount).toLocaleString()}</strong> has been rejected.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Your wallet has been refunded. Please contact support if you have questions.</p>`,
        });
      }
    } catch {}

    return res.json({ status: 'success', message: 'Withdrawal rejected and wallet refunded.' });
  } catch (err) {
    await t.rollback();
    console.error('[rejectWithdrawal]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── POST /api/admin/withdrawals/:id/complete — admin marks as paid ────────────
const completeWithdrawal = async (req, res) => {
  try {
    const withdrawal = await db.Withdrawal.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'user' }],
    });
    if (!withdrawal) return res.status(404).json({ status: 'error', message: 'Not found.' });
    if (withdrawal.status !== 'approved')
      return res.status(400).json({ status: 'error', message: 'Withdrawal must be approved first.' });

    await withdrawal.update({
      status:       'completed',
      processed_at: new Date(),
      admin_note:   req.body?.note || 'Payment transferred.',
    });

    // Notify user
    try {
      if (withdrawal.user) {
        await notify.sendEmail({
          to: withdrawal.user.email,
          subject: '💰 Withdrawal Completed — Showbiz Platform',
          html: `<p>Hi ${withdrawal.user.first_name},</p>
            <p>Your withdrawal of <strong>₦${parseFloat(withdrawal.amount).toLocaleString()}</strong> has been transferred to your ${withdrawal.bank_name} account.</p>`,
        });
      }
    } catch {}

    return res.json({ status: 'success', message: 'Withdrawal marked as completed.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

module.exports = { createWithdrawal, listWithdrawals, adminListWithdrawals, approveWithdrawal, rejectWithdrawal, completeWithdrawal };
