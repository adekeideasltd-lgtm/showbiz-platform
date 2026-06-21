'use strict';

const notify = require('../utils/email/notifications');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db      = require('../models');
const { getSetting } = require('./settings.controller');
const appNotify = require('../utils/notify');
const { creditWallet, debitWallet, getOrCreateWallet } = require('./wallet.controller');

const getCommissionRate = async () => {
  try { return await getSetting('commission_rate', 10); } catch { return 10; }
};

// ── POST /api/payments/initiate — debit owner wallet ─────────────────────────
const initiatePayment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { booking_id } = req.body;
    if (!booking_id) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'booking_id required.' }); }

    const booking = await db.Booking.findByPk(booking_id, {
      include: [{ model: db.User, as: 'owner', attributes: ['id','email','first_name','last_name'] }],
      transaction: t,
    });

    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.owner_id !== req.user.id) { await t.rollback(); return res.status(403).json({ status: 'error', message: 'Not your booking.' }); }
    if (booking.status !== 'confirmed') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Only confirmed bookings can be paid.' }); }

    const existing = await db.Payment.findOne({ where: { booking_id, status: ['pending','success','completed'] }, transaction: t });
    if (existing) { await t.rollback(); return res.status(409).json({ status: 'error', message: 'Payment already exists for this booking.' }); }

    const amount       = parseFloat(booking.total_amount);
    const RATE         = await getCommissionRate();
    const commission   = parseFloat((amount * RATE / 100).toFixed(2));
    const model_payout = parseFloat((amount - commission).toFixed(2));
    const reference    = 'SHW-' + uuidv4().split('-')[0].toUpperCase() + '-' + Date.now();

    // Check wallet balance
    const wallet = await getOrCreateWallet(req.user.id);
    if (parseFloat(wallet.balance) < amount) {
      await t.rollback();
      return res.status(400).json({
        status: 'error',
        message: `Insufficient wallet balance. Your balance is ₦${parseFloat(wallet.balance).toLocaleString()} but ₦${amount.toLocaleString()} is required. Please fund your wallet first.`,
        data: { wallet_balance: wallet.balance, required: amount },
      });
    }

    // Debit owner wallet
    await debitWallet(req.user.id, amount, `Booking payment — ${booking.event_title}`, reference, { booking_id });

    // Create payment record
    const payment = await db.Payment.create({
      id:                uuidv4(),
      booking_id,
      payer_id:          req.user.id,
      amount,
      commission_rate:   RATE,
      commission_amount: commission,
      model_payout,
      currency:          'NGN',
      status:            'success',
      provider:          'wallet',
      provider_reference: reference,
      paid_at:           new Date(),
      metadata:          { payment_method: 'wallet', event_title: booking.event_title },
    }, { transaction: t });

    // Update booking to paid
    await booking.update({ status: 'paid' }, { transaction: t });
    await db.BookingStatusHistory.create({ id: require('uuid').v4(), booking_id: booking_id, to_status: 'paid', changed_by: req.user.id, note: 'Payment made from wallet' }, { transaction: t });

    await t.commit();

    return res.status(201).json({
      status: 'success',
      message: `₦${amount.toLocaleString()} successfully deducted from your wallet.`,
      data: { payment_id: payment.id, reference, amount, commission, model_payout, method: 'wallet' },
    });
  } catch (err) {
    try { await t.rollback(); } catch {}
    console.error('[initiatePayment]', err);
    return res.status(500).json({ status: 'error', message: 'Payment failed: ' + err.message });
  }
};

// ── POST /api/payments/complete-booking/:bookingId — credit model wallet ──────
const completeBookingPayment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.bookingId, {
      include: [{ model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user' }] }],
      transaction: t,
    });

    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.status !== 'paid') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Booking must be paid before completing.' }); }

    const payment = await db.Payment.findOne({ where: { booking_id: booking.id, status: 'success' }, transaction: t });
    if (!payment) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Payment not found.' }); }

    const modelUserId = booking.model?.user_id || booking.model?.user?.id;
    if (!modelUserId) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Model user not found.' }); }

    // Credit model wallet
    await creditWallet(modelUserId, parseFloat(payment.model_payout),
      `Booking payout — ${booking.event_title}`,
      'PAYOUT-' + payment.provider_reference,
      { booking_id: booking.id, payment_id: payment.id }
    );

    await booking.update({ status: 'completed' }, { transaction: t });
    await payment.update({ status: 'completed' }, { transaction: t });
    await db.BookingStatusHistory.create({ id: require('uuid').v4(), booking_id: booking.id, to_status: 'completed', changed_by: req.user.id, note: 'Completed — model wallet credited' }, { transaction: t });

    await t.commit();
    return res.json({ status: 'success', message: `Booking completed. ₦${parseFloat(payment.model_payout).toLocaleString()} credited to model wallet.` });
  } catch (err) {
    try { await t.rollback(); } catch {}
    console.error('[completeBookingPayment]', err);
    return res.status(500).json({ status: 'error', message: 'Failed: ' + err.message });
  }
};

// ── GET /api/payments ─────────────────────────────────────────────────────────
const listPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const where = { payer_id: req.user.id };
    const { count, rows } = await db.Payment.findAndCountAll({
      where,
      include: [{ model: db.Booking, as: 'booking', attributes: ['id','event_title','event_date','status'] }],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    return res.json({ status: 'success', data: { payments: rows, total: count } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── GET /api/admin/payments ───────────────────────────────────────────────────
const adminListPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.status = status;
    const { count, rows } = await db.Payment.findAndCountAll({
      where,
      include: [
        { model: db.Booking, as: 'booking', attributes: ['id','event_title','event_date'] },
        { model: db.User, as: 'payer', attributes: ['id','first_name','last_name','email'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    // Calculate summary
    const totalRevenue   = await db.Payment.sum('amount',            { where: { status: ['success','completed'] } }) || 0;
    const totalCommission = await db.Payment.sum('commission_amount', { where: { status: ['success','completed'] } }) || 0;
    const totalPayouts   = await db.Payment.sum('model_payout',      { where: { status: ['success','completed'] } }) || 0;
    const summary = {
      total_revenue:     totalRevenue,
      total_commission:  totalCommission,
      total_payouts:     totalPayouts,
      total_transactions: count,
    };

    return res.json({ status: 'success', data: { payments: rows, total: count, summary } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── GET /api/admin/payments/stats ─────────────────────────────────────────────
const adminPaymentStats = async (req, res) => {
  try {
    const total      = await db.Payment.sum('amount',            { where: { status: ['success','completed'] } }) || 0;
    const commission = await db.Payment.sum('commission_amount', { where: { status: ['success','completed'] } }) || 0;
    const payouts    = await db.Payment.sum('model_payout',      { where: { status: ['success','completed'] } }) || 0;
    const count      = await db.Payment.count({ where: { status: ['success','completed'] } });
    return res.json({ status: 'success', data: { total, commission, payouts, count } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── Paystack webhook — wallet funding only ────────────────────────────────────
const paystackWebhook = async (req, res) => {
  try {
    const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
    // Raw body required for accurate Paystack signature verification
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) return res.status(401).end();
    res.sendStatus(200);
    // Parse payload from raw buffer or already-parsed body
    const payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
    const { event, data } = payload;
    if (event === 'charge.success' && data.reference?.startsWith('WALLET_')) {
      // Transaction + row lock prevents a race condition if Paystack
      // delivers the same webhook twice in close succession (it does retry).
      const t = await db.sequelize.transaction();
      try {
        const pending = await db.WalletTransaction.findOne({
          where: { reference: data.reference },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

        if (!pending) {
          console.log('[Webhook] No matching pending transaction for reference:', data.reference);
          await t.rollback();
          return;
        }

        if (pending.status === 'success') {
          console.log('[Webhook] Already processed:', data.reference);
          await t.rollback();
          return;
        }

        const userId = data.metadata?.user_id || pending.user_id;
        if (userId) {
          await creditWallet(userId, data.amount / 100, 'Wallet funding via Paystack (webhook)', data.reference, {}, t);
          await pending.update({ status: 'success' }, { transaction: t });
        }

        await t.commit();
      } catch (innerErr) {
        await t.rollback();
        console.error('[paystackWebhook] transaction error:', innerErr.message);
      }
    }
  } catch (err) { console.error('[paystackWebhook]', err.message); }
};

// ── Reconciliation: catch any wallet funding that Paystack confirmed but our
//    webhook never received/processed (network blip, server downtime, etc).
//    Run periodically via cron against all 'pending' WALLET_ transactions
//    older than a few minutes, re-verifying directly against Paystack's API.
const reconcilePendingWalletTransactions = async () => {
  const axios = require('axios');
  const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
  const cutoff = new Date(Date.now() - 5 * 60 * 1000); // older than 5 minutes

  const stale = await db.WalletTransaction.findAll({
    where: {
      status: 'pending',
      reference: { [db.Sequelize.Op.like]: 'WALLET_%' },
      created_at: { [db.Sequelize.Op.lt]: cutoff },
    },
  });

  console.log(`[Reconcile] Found ${stale.length} stale pending wallet transaction(s).`);

  for (const txn of stale) {
    try {
      const verifyRes = await axios.get(
        `https://api.paystack.co/transaction/verify/${txn.reference}`,
        { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
      );
      const payData = verifyRes.data?.data;
      if (payData?.status === 'success') {
        const t = await db.sequelize.transaction();
        try {
          const locked = await db.WalletTransaction.findOne({
            where: { id: txn.id },
            lock: t.LOCK.UPDATE,
            transaction: t,
          });
          if (locked && locked.status !== 'success') {
            await creditWallet(locked.user_id, payData.amount / 100, 'Wallet funding via Paystack (reconciled)', locked.reference, {}, t);
            await locked.update({ status: 'success' }, { transaction: t });
            console.log(`[Reconcile] Recovered missed payment: ${locked.reference}`);
          }
          await t.commit();
        } catch (innerErr) {
          await t.rollback();
          console.error('[Reconcile] transaction error:', innerErr.message);
        }
      } else if (payData?.status === 'failed' || payData?.status === 'abandoned') {
        await txn.update({ status: 'failed' });
        console.log(`[Reconcile] Marked as failed: ${txn.reference}`);
      }
    } catch (err) {
      console.error(`[Reconcile] Could not verify ${txn.reference}:`, err.message);
    }
  }

  return { checked: stale.length };
};

module.exports = { initiatePayment, completeBookingPayment, listPayments, adminListPayments, adminPaymentStats, paystackWebhook, reconcilePendingWalletTransactions };
