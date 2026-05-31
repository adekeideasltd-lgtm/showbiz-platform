'use strict';
const { v4: uuidv4 } = require('uuid');
const axios  = require('axios');
const db     = require('../models');

// ── Helper: get or create wallet ──────────────────────────────────────────────
const getOrCreateWallet = async (userId) => {
  let wallet = await db.Wallet.findOne({ where: { user_id: userId } });
  if (!wallet) wallet = await db.Wallet.create({ user_id: userId });
  return wallet;
};

// ── Helper: credit wallet ─────────────────────────────────────────────────────
const creditWallet = async (userId, amount, description, reference, metadata = {}, t = null) => {
  // Idempotency check — prevent double credit for same reference
  if (reference) {
    const existing = await db.WalletTransaction.findOne({
      where: { reference, status: 'success' },
      ...(t ? { transaction: t } : {}),
    });
    if (existing) {
      console.log('[creditWallet] Already processed reference:', reference);
      return await getOrCreateWallet(userId);
    }
  }
  const wallet = await getOrCreateWallet(userId);
  const balanceBefore = parseFloat(wallet.balance);
  const balanceAfter  = balanceBefore + parseFloat(amount);
  await wallet.update({ balance: balanceAfter });
  // Send email notification for wallet credit
  try {
    const user = await db.User.findByPk(userId);
    if (user) require('../utils/email/notifications').onWalletCredited(user, amount, description).catch(() => {});
  } catch {}
  await db.WalletTransaction.create({
    wallet_id:      wallet.id,
    user_id:        userId,
    type:           'credit',
    amount,
    balance_before: balanceBefore,
    balance_after:  balanceAfter,
    description,
    reference,
    status:         'success',
    metadata,
  });
  return wallet;
};

// ── Helper: debit wallet ──────────────────────────────────────────────────────
const debitWallet = async (userId, amount, description, reference, metadata = {}, t = null) => {
  // Idempotency check — prevent double debit for same reference
  if (reference) {
    const existing = await db.WalletTransaction.findOne({
      where: { reference, type: 'debit', status: 'success' },
      ...(t ? { transaction: t } : {}),
    });
    if (existing) {
      console.log('[debitWallet] Already processed reference:', reference);
      return await getOrCreateWallet(userId);
    }
  }
  const wallet = await getOrCreateWallet(userId);
  const balanceBefore = parseFloat(wallet.balance);
  if (balanceBefore < parseFloat(amount))
    throw new Error('Insufficient wallet balance');
  const balanceAfter = balanceBefore - parseFloat(amount);
  await wallet.update({ balance: balanceAfter });
  // Send email notification for wallet credit
  try {
    const user = await db.User.findByPk(userId);
    if (user) require('../utils/email/notifications').onWalletCredited(user, amount, description).catch(() => {});
  } catch {}
  await db.WalletTransaction.create({
    wallet_id:      wallet.id,
    user_id:        userId,
    type:           'debit',
    amount,
    balance_before: balanceBefore,
    balance_after:  balanceAfter,
    description,
    reference,
    status:         'success',
    metadata,
  });
  return wallet;
};

// ── GET /api/wallet ───────────────────────────────────────────────────────────
const getWallet = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);
    return res.json({ status: 'success', data: wallet });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch wallet.' });
  }
};

// ── GET /api/wallet/transactions ──────────────────────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const wallet = await getOrCreateWallet(req.user.id);
    const { page = 1, limit = 20 } = req.query;
    const { count, rows } = await db.WalletTransaction.findAndCountAll({
      where:  { wallet_id: wallet.id },
      order:  [['created_at', 'DESC']],
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    return res.json({
      status: 'success',
      data:   { transactions: rows, total: count, page: parseInt(page) },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch transactions.' });
  }
};

// ── POST /api/wallet/fund — initiate Paystack funding ────────────────────────
const initiateFunding = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || parseFloat(amount) < 100)
      return res.status(400).json({ status: 'error', message: 'Minimum funding amount is ₦100.' });

    const user      = await db.User.findByPk(req.user.id);
    const reference = 'WALLET_' + uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase();
    const amountKobo = Math.round(parseFloat(amount) * 100);

    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email:     user.email,
        amount:    amountKobo,
        reference,
        callback_url: process.env.FRONTEND_URL + '/wallet/callback',
        metadata: {
          user_id:   user.id,
          purpose:   'wallet_funding',
          amount_ngn: amount,
        },
      },
      { headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY } }
    );

    // Create pending transaction
    const wallet = await getOrCreateWallet(req.user.id);
    await db.WalletTransaction.create({
      wallet_id:      wallet.id,
      user_id:        req.user.id,
      type:           'credit',
      amount,
      balance_before: parseFloat(wallet.balance),
      balance_after:  parseFloat(wallet.balance),
      description:    'Wallet funding via Paystack',
      reference,
      status:         'pending',
      metadata:       { purpose: 'wallet_funding' },
    });

    return res.json({
      status:        'success',
      data: {
        authorization_url: response.data.data.authorization_url,
        reference,
        amount,
      },
    });
  } catch (err) {
    console.error('[initiateFunding]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to initiate funding.' });
  }
};

// ── GET /api/wallet/verify/:reference ────────────────────────────────────────
const verifyFunding = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { reference } = req.params;

    // Lock the pending transaction row to prevent race conditions
    const pending = await db.WalletTransaction.findOne({
      where: { reference },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    // Already successfully processed
    if (pending?.status === 'success') {
      await t.rollback();
      return res.json({ status: 'success', message: 'Already processed.', data: { amount: pending.amount } });
    }

    // Row lock (FOR UPDATE) already prevents concurrent requests

    // Verify with Paystack
    const response = await axios.get(
      'https://api.paystack.co/transaction/verify/' + reference,
      { headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY } }
    );

    const data = response.data.data;
    if (data.status !== 'success') {
      if (pending) await pending.update({ status: 'failed' }, { transaction: t });
      await t.commit();
      return res.status(400).json({ status: 'error', message: 'Payment not successful.' });
    }

    const userId = data.metadata?.user_id || req.user.id;
    const amount = data.amount / 100;

    // Credit wallet within transaction
    const wallet = await creditWallet(userId, amount, 'Wallet funding via Paystack', reference, { paystack_ref: reference }, t);

    // Update transaction record to success
    if (pending) {
      await pending.update({
        status: 'success',
        balance_after: parseFloat(wallet.balance),
      }, { transaction: t });
    }

    await t.commit();

    return res.json({
      status:  'success',
      message: `₦${amount.toLocaleString()} successfully added to your wallet.`,
      data:    { amount, new_balance: wallet.balance },
    });
  } catch (err) {
    await t.rollback();
    console.error('[verifyFunding]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to verify payment.' });
  }
};

// ── GET /api/admin/wallets ────────────────────────────────────────────────────
const adminListWallets = async (req, res) => {
  try {
    const wallets = await db.Wallet.findAll({
      include: [{ model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
      order: [['balance', 'DESC']],
    });
    return res.json({ status: 'success', data: wallets });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── POST /api/admin/wallets/:userId/credit ────────────────────────────────────
const adminCredit = async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount) return res.status(400).json({ status: 'error', message: 'Amount required.' });
    const reference = 'ADMIN_CREDIT_' + Date.now();
    const wallet = await creditWallet(req.params.userId, amount, description || 'Admin credit', reference, { credited_by: req.user.id });
    return res.json({ status: 'success', message: 'Wallet credited.', data: wallet });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

// ── POST /api/admin/wallets/:userId/debit ─────────────────────────────────────
const adminDebit = async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount) return res.status(400).json({ status: 'error', message: 'Amount required.' });
    const reference = 'ADMIN_DEBIT_' + Date.now();
    const wallet = await debitWallet(req.params.userId, amount, description || 'Admin debit', reference, { debited_by: req.user.id });
    return res.json({ status: 'success', message: 'Wallet debited.', data: wallet });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = {
  getWallet, getTransactions, initiateFunding, verifyFunding,
  adminListWallets, adminCredit, adminDebit,
  creditWallet, debitWallet, getOrCreateWallet,
};
