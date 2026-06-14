const db = require('../models');
const appNotify = require('../utils/notify');
const notify = require('../utils/email/notifications');

const GRACE_DAYS = 30;

// ── POST /api/account/deactivate ─────────────────────────────────────────────
const deactivateAccount = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    if (user.account_status === 'deactivated') {
      return res.status(400).json({ status: 'error', message: 'Account is already deactivated.' });
    }

    // Check for active bookings (entertainers)
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (profile) {
      const activeBookings = await db.Booking.count({
        where: { model_id: profile.id, status: ['confirmed', 'paid', 'model_review'] },
      });
      if (activeBookings > 0) {
        return res.status(400).json({ status: 'error', message: `You have ${activeBookings} active booking(s). Please resolve them before deactivating.` });
      }
    }

    // Check for active bookings (owners)
    const ownerActiveBookings = await db.Booking.count({
      where: { owner_id: req.user.id, status: ['pending', 'model_review', 'confirmed', 'paid'] },
    });
    if (ownerActiveBookings > 0) {
      return res.status(400).json({ status: 'error', message: `You have ${ownerActiveBookings} active booking(s). Please resolve them before deactivating.` });
    }

    await user.update({ account_status: 'deactivated', deactivated_at: new Date() });
    return res.json({ status: 'success', message: 'Account deactivated. You can reactivate by logging in again.' });
  } catch (err) {
    console.error('[deactivateAccount] ERROR:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to deactivate account.' });
  }
};

// ── POST /api/account/request-deletion ───────────────────────────────────────
const requestDeletion = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    if (user.deletion_requested_at) {
      return res.status(400).json({ status: 'error', message: 'A deletion request is already pending.' });
    }

    // Block if active bookings exist
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (profile) {
      const activeBookings = await db.Booking.count({
        where: { model_id: profile.id, status: ['confirmed', 'paid', 'model_review'] },
      });
      if (activeBookings > 0) {
        return res.status(400).json({ status: 'error', message: `You have ${activeBookings} active booking(s). Please resolve them before requesting deletion.` });
      }
    }
    const ownerActiveBookings = await db.Booking.count({
      where: { owner_id: req.user.id, status: ['pending', 'model_review', 'confirmed', 'paid'] },
    });
    if (ownerActiveBookings > 0) {
      return res.status(400).json({ status: 'error', message: `You have ${ownerActiveBookings} active booking(s). Please resolve them before requesting deletion.` });
    }

    const now = new Date();
    const scheduledAt = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);

    await user.update({
      account_status: 'pending_deletion',
      deletion_requested_at: now,
      deletion_scheduled_at: scheduledAt,
    });

    // Notify admins
    appNotify.notifyAdmins({
      type: 'account_deletion_requested',
      icon: '🗑️',
      color: '#E85C5C',
      title: 'Account deletion requested',
      body: `User ${user.email} has requested permanent deletion. Scheduled for ${scheduledAt.toDateString()}.`,
      link: '/admin/users',
      metadata: { user_id: user.id, email: user.email },
    }).catch(console.error);

    return res.json({
      status: 'success',
      message: `Deletion request received. Your account will be permanently deleted on ${scheduledAt.toDateString()}. You can cancel this request before then.`,
      data: { deletion_scheduled_at: scheduledAt },
    });
  } catch (err) {
    console.error('[requestDeletion] ERROR:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to request deletion.' });
  }
};

// ── POST /api/account/cancel-deletion ────────────────────────────────────────
const cancelDeletion = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    if (!user.deletion_requested_at) {
      return res.status(400).json({ status: 'error', message: 'No pending deletion request found.' });
    }

    await user.update({
      account_status: 'active',
      deletion_requested_at: null,
      deletion_scheduled_at: null,
    });

    return res.json({ status: 'success', message: 'Deletion request cancelled. Your account is active again.' });
  } catch (err) {
    console.error('[cancelDeletion] ERROR:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to cancel deletion request.' });
  }
};

// ── GET /api/account/status ───────────────────────────────────────────────────
const getAccountStatus = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id, {
      attributes: ['id', 'account_status', 'deactivated_at', 'deletion_requested_at', 'deletion_scheduled_at'],
    });
    return res.json({ status: 'success', data: user });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to get account status.' });
  }
};

// ── Called internally during login to auto-reactivate deactivated accounts ───
const autoReactivate = async (userId) => {
  try {
    const user = await db.User.findByPk(userId);
    if (user && user.account_status === 'deactivated') {
      await user.update({ account_status: 'active', deactivated_at: null });
      console.log(`[autoReactivate] User ${userId} reactivated on login`);
    }
  } catch (err) {
    console.error('[autoReactivate] ERROR:', err.message);
  }
};

module.exports = { deactivateAccount, requestDeletion, cancelDeletion, getAccountStatus, autoReactivate };
