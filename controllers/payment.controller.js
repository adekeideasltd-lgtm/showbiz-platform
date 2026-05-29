'use strict';

const notify = require('../utils/email/notifications');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db      = require('../models');
const { getSetting } = require('./settings.controller');
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
        { model: db.User, as: 'owner', attributes: ['id','first_name','last_name','email'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    return res.json({ status: 'success', data: { payments: rows, total: count } });
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
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) return res.status(401).end();
    res.sendStatus(200);
    const { event, data } = req.body;
    if (event === 'charge.success' && data.reference?.startsWith('WALLET_')) {
      const existing = await db.WalletTransaction.findOne({ where: { reference: data.reference, status: 'success' } });
      if (!existing) {
        const userId = data.metadata?.user_id;
        if (userId) {
          await creditWallet(userId, data.amount / 100, 'Wallet funding via Paystack', data.reference, {});
          await db.WalletTransaction.update({ status: 'success' }, { where: { reference: data.reference, status: 'pending' } });
        }
      }
    }
  } catch (err) { console.error('[paystackWebhook]', err.message); }
};

module.exports = { initiatePayment, completeBookingPayment, listPayments, adminListPayments, adminPaymentStats, paystackWebhook };
