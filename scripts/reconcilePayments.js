/**
 * reconcilePayments.js
 * Catches wallet funding payments that Paystack confirmed successful but our
 * webhook never processed (missed delivery, transient server downtime, etc).
 * Re-verifies any 'pending' WALLET_ transaction older than 5 minutes directly
 * against Paystack's API and credits the wallet if confirmed.
 *
 * Run via cron every 15-30 minutes.
 */
require('dotenv').config();
const db = require('../models');
const { reconcilePendingWalletTransactions } = require('../controllers/payment.controller');

(async () => {
  try {
    const result = await reconcilePendingWalletTransactions();
    console.log(`[reconcilePayments] Done. Checked ${result.checked} stale transaction(s) at ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[reconcilePayments] Fatal error:', err.message);
  } finally {
    await db.sequelize.close();
    process.exit(0);
  }
})();
