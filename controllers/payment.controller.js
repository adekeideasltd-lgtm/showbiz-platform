'use strict';

const notify = require('../utils/email/notifications');

const https   = require('https');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db      = require('../models');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const COMMISSION_RATE = parseFloat(process.env.COMMISSION_RATE || '10');

// ── Helper: Paystack API request ──────────────────────────────────────────────
const paystackRequest = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: 'Bearer ' + PAYSTACK_SECRET,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid Paystack response')); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

// ── POST /api/payments/initiate ───────────────────────────────────────────────
const initiatePayment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { booking_id } = req.body;
    if (!booking_id) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'booking_id is required.' });
    }

    const booking = await db.Booking.findByPk(booking_id, {
      include: [{ model: db.User, as: 'owner', attributes: ['id','email','first_name','last_name'] }],
      transaction: t,
    });

    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.owner_id !== req.user.id) { await t.rollback(); return res.status(403).json({ status: 'error', message: 'You can only pay for your own bookings.' }); }
    if (booking.status !== 'confirmed') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Only confirmed bookings can be paid for.' }); }

    const existing = await db.Payment.findOne({ where: { booking_id, status: ['pending','success'] }, transaction: t });
    if (existing) {
      await t.rollback();
      // If pending, return existing authorization URL
      if (existing.status === 'pending' && existing.authorization_url) {
        return res.json({
          status: 'success',
          message: 'Payment already initiated. Complete your payment.',
          data: {
            payment_id:        existing.id,
            reference:         existing.provider_reference,
            amount:            parseFloat(existing.amount),
            commission:        parseFloat(existing.commission_amount),
            model_payout:      parseFloat(existing.model_payout),
            currency:          'NGN',
            authorization_url: existing.authorization_url,
            sandbox_mode:      false,
          },
        });
      }
      return res.status(409).json({ status: 'error', message: 'A payment already exists for this booking.' });
    }

    const amount        = parseFloat(booking.total_amount);
    const commission    = parseFloat((amount * COMMISSION_RATE / 100).toFixed(2));
    const model_payout  = parseFloat((amount - commission).toFixed(2));
    const reference     = 'SHW-' + uuidv4().split('-')[0].toUpperCase() + '-' + Date.now();

    // Create payment record first
    const payment = await db.Payment.create({
      id:                uuidv4(),
      booking_id,
      payer_id:          req.user.id,
      amount,
      commission_rate:   COMMISSION_RATE,
      commission_amount: commission,
      model_payout,
      currency:          'NGN',
      status:            'pending',
      provider:          'paystack',
      provider_reference: reference,
      metadata: {
        booking_title: booking.event_title,
        event_date:    booking.event_date,
        payer_name:    booking.owner.first_name + ' ' + booking.owner.last_name,
      },
    }, { transaction: t });

    // Initialize Paystack transaction
    const paystackRes = await paystackRequest('POST', '/transaction/initialize', {
      email:        booking.owner.email,
      amount:       Math.round(amount * 100), // kobo
      reference,
      currency:     'NGN',
      callback_url: (process.env.APP_URL || 'http://localhost:3000') + '/api/payments/callback',
      metadata: {
        payment_id:    payment.id,
        booking_id,
        cancel_action: (process.env.FRONTEND_URL || 'http://localhost:3001') + '/owner/bookings',
        custom_fields: [
          { display_name: 'Event',        variable_name: 'event',       value: booking.event_title },
          { display_name: 'Commission',   variable_name: 'commission',  value: 'NGN ' + commission },
          { display_name: 'Model Payout', variable_name: 'payout',      value: 'NGN ' + model_payout },
        ],
      },
    });

    if (!paystackRes.status) {
      await t.rollback();
      console.error('[Paystack init failed]', paystackRes.message);
      return res.status(502).json({ status: 'error', message: 'Payment gateway error: ' + (paystackRes.message || 'Unknown error') });
    }

    await payment.update({
      authorization_url:    paystackRes.data.authorization_url,
      provider_access_code: paystackRes.data.access_code,
    }, { transaction: t });

    await t.commit();

    return res.status(201).json({
      status: 'success',
      message: 'Payment initialized. Redirect user to authorization_url.',
      data: {
        payment_id:        payment.id,
        reference,
        amount,
        commission,
        model_payout,
        currency:          'NGN',
        authorization_url: paystackRes.data.authorization_url,
        access_code:       paystackRes.data.access_code,
        sandbox_mode:      false,
      },
    });
  } catch (err) {
    await t.rollback();
    console.error('[initiatePayment]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to initiate payment.' });
  }
};

// ── GET /api/payments/callback — redirect after Paystack payment ──────────────
const paymentCallback = async (req, res) => {
  try {
    const { reference, trxref } = req.query;
    const ref = reference || trxref;

    if (!ref) return res.redirect((process.env.FRONTEND_URL || 'http://localhost:3001') + '/owner/bookings?payment=failed');

    // Verify with Paystack
    const verified = await paystackRequest('GET', '/transaction/verify/' + ref);

    if (!verified.status || verified.data.status !== 'success') {
      return res.redirect((process.env.FRONTEND_URL || 'http://localhost:3001') + '/owner/bookings?payment=failed&ref=' + ref);
    }

    const payment = await db.Payment.findOne({ where: { provider_reference: ref } });
    if (payment && payment.status !== 'success') {
      await payment.update({ status: 'success', payment_method: verified.data.channel, paid_at: new Date(verified.data.paid_at) });
      const booking = await db.Booking.findByPk(payment.booking_id);
      if (booking) {
        await db.Payout.create({ id: uuidv4(), payment_id: payment.id, model_id: booking.model_id, amount: payment.model_payout, status: 'pending' });
      }
    }

    return res.redirect((process.env.FRONTEND_URL || 'http://localhost:3001') + '/owner/bookings?payment=success&ref=' + ref);
  } catch (err) {
    console.error('[paymentCallback]', err.message);
    return res.redirect((process.env.FRONTEND_URL || 'http://localhost:3001') + '/owner/bookings?payment=error');
  }
};

// ── POST /api/payments/webhook — Paystack webhook ─────────────────────────────
const webhook = async (req, res) => {
  try {
    // Verify webhook signature
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ message: 'Invalid signature' });
    }

    const event = req.body;
    console.log('[Paystack Webhook]', event.event);

    if (event.event === 'charge.success') {
      const { reference, amount, channel, paid_at } = event.data;

      const payment = await db.Payment.findOne({ where: { provider_reference: reference } });
      if (!payment) return res.sendStatus(200);
      if (payment.status === 'success') return res.sendStatus(200); // Already processed

      const t = await db.sequelize.transaction();
      try {
        await payment.update({
          status:         'success',
          payment_method: channel,
          paid_at:        new Date(paid_at),
        }, { transaction: t });

        const booking = await db.Booking.findByPk(payment.booking_id, { transaction: t });
        if (booking) {
          await db.Payout.create({
            id:         uuidv4(),
            payment_id: payment.id,
            model_id:   booking.model_id,
            amount:     payment.model_payout,
            status:     'pending',
          }, { transaction: t });
        }

        await t.commit();
        console.log('[Webhook] Payment confirmed:', reference, 'Amount:', amount / 100);
      } catch (err) {
        await t.rollback();
        console.error('[Webhook tx error]', err.message);
      }
    }

    if (event.event === 'refund.processed') {
      const { transaction_reference } = event.data;
      const payment = await db.Payment.findOne({ where: { provider_reference: transaction_reference } });
      if (payment) {
        await payment.update({ status: 'refunded', refunded_at: new Date() });
        await db.Payout.update({ status: 'failed', notes: 'Cancelled due to refund' }, { where: { payment_id: payment.id, status: 'pending' } });
        console.log('[Webhook] Refund processed:', transaction_reference);
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('[webhook]', err.message);
    return res.sendStatus(500);
  }
};

// ── POST /api/payments/verify — manual verify by reference ────────────────────
const verifyPayment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const reference = req.query.reference || req.body.reference;
    if (!reference) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'reference is required.' }); }

    const payment = await db.Payment.findOne({ where: { provider_reference: reference }, transaction: t });
    if (!payment) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Payment not found.' }); }
    if (payment.status === 'success') { await t.rollback(); return res.json({ status: 'success', message: 'Payment already verified.', data: payment }); }

    const verified = await paystackRequest('GET', '/transaction/verify/' + reference);
    if (!verified.status || verified.data.status !== 'success') {
      await payment.update({ status: 'failed' }, { transaction: t });
      await t.commit();
      return res.status(400).json({ status: 'error', message: 'Payment not successful: ' + verified.data.status });
    }

    await payment.update({
      status:         'success',
      payment_method: verified.data.channel,
      paid_at:        new Date(verified.data.paid_at),
    }, { transaction: t });

    const booking = await db.Booking.findByPk(payment.booking_id, { transaction: t });
    if (booking) {
      await db.Payout.create({ id: uuidv4(), payment_id: payment.id, model_id: booking.model_id, amount: payment.model_payout, status: 'pending' }, { transaction: t });
    }

    await t.commit();
    try {
      const payer = await db.User.findByPk(payment.payer_id);
      const bk    = await db.Booking.findByPk(payment.booking_id);
      if (payer && bk) notify.onPaymentSuccess(payment, bk, payer).catch(console.error);
    } catch (_) {}
    return res.json({ status: 'success', message: 'Payment verified successfully.', data: { payment_id: payment.id, amount: payment.amount, status: 'success' } });
  } catch (err) {
    await t.rollback();
    console.error('[verifyPayment]', err.message);
    return res.status(500).json({ status: 'error', message: 'Payment verification failed.' });
  }
};

// ── GET /api/payments — list own payments ─────────────────────────────────────
const listPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const where = {};
    if (req.user.roles.includes('showbiz_owner')) where.payer_id = req.user.id;

    const { count, rows } = await db.Payment.findAndCountAll({
      where,
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order:  [['created_at', 'DESC']],
      include: [{ model: db.Booking, as: 'booking', attributes: ['id','event_title','event_date','status'] }],
    });

    return res.json({ status: 'success', data: { payments: rows, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) } } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch payments.' });
  }
};

// ── GET /api/payments/:id ─────────────────────────────────────────────────────
const getPayment = async (req, res) => {
  try {
    const payment = await db.Payment.findByPk(req.params.id, {
      include: [{ model: db.Booking, as: 'booking' }],
    });
    if (!payment) return res.status(404).json({ status: 'error', message: 'Payment not found.' });
    const isAdmin = req.user.isSuperAdmin || ['admin','manager'].some(r => req.user.roles.includes(r));
    if (!isAdmin && payment.payer_id !== req.user.id) return res.status(403).json({ status: 'error', message: 'Access denied.' });
    return res.json({ status: 'success', data: payment });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch payment.' });
  }
};

// ── ADMIN: GET /api/admin/payments ────────────────────────────────────────────
const adminListPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.status = status;

    const { count, rows } = await db.Payment.findAndCountAll({
      where,
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order:  [['created_at', 'DESC']],
      include: [
        { model: db.Booking, as: 'booking', attributes: ['id','event_title','event_date'] },
        { model: db.User,    as: 'payer',   attributes: ['id','first_name','last_name','email'] },
      ],
    });

    const totals = await db.Payment.findOne({
      where: { status: 'success' },
      attributes: [
        [db.sequelize.fn('SUM', db.sequelize.col('amount')),           'total_revenue'],
        [db.sequelize.fn('SUM', db.sequelize.col('commission_amount')),'total_commission'],
        [db.sequelize.fn('SUM', db.sequelize.col('model_payout')),     'total_payouts'],
        [db.sequelize.fn('COUNT', db.sequelize.col('id')),             'total_transactions'],
      ],
    });

    return res.json({ status: 'success', data: { payments: rows, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) }, summary: totals } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch payments.' });
  }
};

// ── ADMIN: GET /api/admin/payouts ─────────────────────────────────────────────
const adminListPayouts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status) where.status = status;

    const { count, rows } = await db.Payout.findAndCountAll({
      where,
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order:  [['created_at', 'DESC']],
      include: [{ model: db.Payment, as: 'payment', attributes: ['id','amount','commission_amount','currency'] }],
    });

    return res.json({ status: 'success', data: { payouts: rows, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) } } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch payouts.' });
  }
};

// ── ADMIN: POST /api/admin/payouts/:id/process — pay model via Paystack Transfer
const processPayout = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const payout = await db.Payout.findByPk(req.params.id, { transaction: t });
    if (!payout) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Payout not found.' }); }
    if (payout.status !== 'pending') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Payout is already ' + payout.status + '.' }); }

    const { bank_name, account_number, account_name, bank_code, notes } = req.body;

    let transfer_code = null;

    // If bank details provided, try Paystack Transfer API
    if (account_number && bank_code) {
      try {
        // Create transfer recipient
        const recipientRes = await paystackRequest('POST', '/transferrecipient', {
          type:           'nuban',
          name:           account_name,
          account_number,
          bank_code,
          currency:       'NGN',
        });

        if (recipientRes.status) {
          const recipient_code = recipientRes.data.recipient_code;

          // Initiate transfer
          const transferRes = await paystackRequest('POST', '/transfer', {
            source:    'balance',
            amount:    Math.round(parseFloat(payout.amount) * 100), // kobo
            recipient: recipient_code,
            reason:    'Model payout — Showbiz Platform',
          });

          if (transferRes.status) {
            transfer_code = transferRes.data.transfer_code;
            console.log('[Transfer initiated]', transfer_code, 'Amount:', payout.amount);
          }
        }
      } catch (transferErr) {
        console.error('[Transfer API error]', transferErr.message);
        // Continue with manual payout if transfer fails
      }
    }

    await payout.update({
      status:         transfer_code ? 'processing' : 'completed',
      bank_name:      bank_name      || null,
      account_number: account_number || null,
      account_name:   account_name   || null,
      transfer_code:  transfer_code  || null,
      notes:          notes          || null,
      processed_by:   req.user.id,
      processed_at:   new Date(),
    }, { transaction: t });

    await t.commit();
    try {
      const mp = await db.ModelProfile.findByPk(payout.model_id, { include: [{ model: db.User, as: 'user' }] });
      if (mp?.user) notify.onPayoutProcessed(payout, mp.user).catch(console.error);
    } catch (_) {}
    return res.json({
      status:  'success',
      message: transfer_code
        ? 'Payout of NGN ' + payout.amount + ' initiated via Paystack Transfer.'
        : 'Payout of NGN ' + payout.amount + ' marked as completed.',
      data: payout,
    });
  } catch (err) {
    await t.rollback();
    console.error('[processPayout]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to process payout.' });
  }
};

// ── ADMIN: POST /api/admin/payments/:id/refund ────────────────────────────────
const refundPayment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { reason } = req.body;
    if (!reason) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Refund reason is required.' }); }

    const payment = await db.Payment.findByPk(req.params.id, { transaction: t });
    if (!payment) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Payment not found.' }); }
    if (payment.status !== 'success') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Only successful payments can be refunded.' }); }

    // Initiate Paystack refund
    try {
      const refundRes = await paystackRequest('POST', '/refund', {
        transaction: payment.provider_reference,
        amount:      Math.round(parseFloat(payment.amount) * 100),
      });
      if (refundRes.status) {
        console.log('[Refund initiated]', payment.provider_reference);
      }
    } catch (refundErr) {
      console.error('[Refund API error]', refundErr.message);
    }

    await payment.update({ status: 'refunded', refunded_at: new Date(), refund_reason: reason }, { transaction: t });
    await db.Payout.update(
      { status: 'failed', notes: 'Cancelled due to refund: ' + reason },
      { where: { payment_id: payment.id, status: 'pending' }, transaction: t }
    );

    await t.commit();
    return res.json({ status: 'success', message: 'Refund initiated successfully.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to refund payment.' });
  }
};

// ── GET /api/payments/banks — list Nigerian banks for payout form ─────────────
const listBanks = async (req, res) => {
  try {
    const banksRes = await paystackRequest('GET', '/bank?country=nigeria&per_page=100');
    if (!banksRes.status) return res.status(502).json({ status: 'error', message: 'Failed to fetch banks.' });
    return res.json({ status: 'success', data: banksRes.data });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch banks.' });
  }
};

// ── POST /api/payments/verify-account — verify bank account number ────────────
const verifyAccount = async (req, res) => {
  try {
    const { account_number, bank_code } = req.body;
    if (!account_number || !bank_code) return res.status(400).json({ status: 'error', message: 'account_number and bank_code are required.' });

    const verifyRes = await paystackRequest('GET', '/bank/resolve?account_number=' + account_number + '&bank_code=' + bank_code);
    if (!verifyRes.status) return res.status(400).json({ status: 'error', message: verifyRes.message || 'Could not verify account.' });

    return res.json({ status: 'success', data: { account_name: verifyRes.data.account_name, account_number: verifyRes.data.account_number } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Account verification failed.' });
  }
};

module.exports = {
  initiatePayment, paymentCallback, webhook, verifyPayment,
  listPayments, getPayment,
  adminListPayments, adminListPayouts,
  processPayout, refundPayment,
  listBanks, verifyAccount,
};
