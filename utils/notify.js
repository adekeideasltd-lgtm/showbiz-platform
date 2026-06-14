/**
 * utils/notify.js
 * Central notification creator for all platform events.
 */
const db = require('../models');

const createNotification = async (userId, { type, title, body, icon, color, link, metadata }) => {
  try {
    await db.Notification.create({
      user_id: userId, type, title, body: body || null,
      icon: icon || '🔔', color: color || '#C9A84C',
      link: link || null, metadata: metadata || {},
    });
  } catch (err) {
    console.error('[notify] ERROR:', err.message);
  }
};

// Helper to get superadmin user_id
const getSuperAdmin = async () => {
  const u = await db.User.findOne({ where: { email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@showbiz.ng' } });
  return u?.id || null;
};

// Helper to get all admin user_ids
const getAdmins = async () => {
  const adminRole = await db.Role.findOne({ where: { name: 'super_admin' } });
  if (!adminRole) return [];
  const assignments = await db.UserRole.findAll({ where: { role_id: adminRole.id } });
  return assignments.map(a => a.user_id);
};

const notifyAdmins = async (notification) => {
  try {
    const adminIds = await getAdmins();
    const superAdminId = await getSuperAdmin();
    const ids = [...new Set([...adminIds, superAdminId].filter(Boolean))];
    for (const id of ids) await createNotification(id, notification);
  } catch (err) {
    console.error('[notifyAdmins] ERROR:', err.message);
  }
};

// ── BOOKING EVENTS ────────────────────────────────────────────────────────────
const onNewBooking = async (booking, ownerId, entertainerUserId) => {
  // Notify admin
  await notifyAdmins({
    type: 'new_booking', icon: '📅', color: '#5B8DEF',
    title: `New booking: ${booking.event_title}`,
    body: `A new booking has been submitted and awaits your review.`,
    link: '/admin/bookings',
    metadata: { booking_id: booking.id },
  });
  // Notify entertainer
  await createNotification(entertainerUserId, {
    type: 'new_booking', icon: '📅', color: '#5B8DEF',
    title: `New booking request: ${booking.event_title}`,
    body: `You have a new booking request awaiting admin review.`,
    link: '/model/bookings',
    metadata: { booking_id: booking.id },
  });
};

const onBookingApprovedByAdmin = async (booking, entertainerUserId, ownerId) => {
  await createNotification(entertainerUserId, {
    type: 'booking_approved', icon: '✅', color: '#2ECC8A',
    title: `Booking approved: ${booking.event_title}`,
    body: `Admin approved this booking. Please review and accept or decline.`,
    link: '/model/bookings',
    metadata: { booking_id: booking.id },
  });
  await createNotification(ownerId, {
    type: 'booking_approved', icon: '✅', color: '#2ECC8A',
    title: `Booking approved: ${booking.event_title}`,
    body: `Your booking has been approved by admin and sent to the entertainer.`,
    link: '/owner/bookings',
    metadata: { booking_id: booking.id },
  });
};

const onBookingRejectedByAdmin = async (booking, ownerId, reason) => {
  await createNotification(ownerId, {
    type: 'booking_rejected', icon: '❌', color: '#E85C5C',
    title: `Booking rejected: ${booking.event_title}`,
    body: `Your booking was rejected. Reason: ${reason}`,
    link: '/owner/bookings',
    metadata: { booking_id: booking.id },
  });
  await notifyAdmins({
    type: 'booking_rejected', icon: '❌', color: '#E85C5C',
    title: `Booking rejected: ${booking.event_title}`,
    body: `Admin rejected this booking. Reason: ${reason}`,
    link: '/admin/bookings',
    metadata: { booking_id: booking.id },
  });
};

const onBookingAcceptedByEntertainer = async (booking, ownerId) => {
  await createNotification(ownerId, {
    type: 'booking_confirmed', icon: '🎉', color: '#2ECC8A',
    title: `Booking confirmed: ${booking.event_title}`,
    body: `The entertainer accepted your booking. Please proceed with payment.`,
    link: '/owner/bookings',
    metadata: { booking_id: booking.id },
  });
  await notifyAdmins({
    type: 'booking_confirmed', icon: '🎉', color: '#2ECC8A',
    title: `Booking confirmed: ${booking.event_title}`,
    body: `Entertainer accepted the booking. Awaiting owner payment.`,
    link: '/admin/bookings',
    metadata: { booking_id: booking.id },
  });
};

const onBookingDeclinedByEntertainer = async (booking, ownerId, reason) => {
  await createNotification(ownerId, {
    type: 'booking_declined', icon: '❌', color: '#E85C5C',
    title: `Booking declined: ${booking.event_title}`,
    body: `The entertainer declined your booking. Reason: ${reason || 'No reason given'}`,
    link: '/owner/bookings',
    metadata: { booking_id: booking.id },
  });
  await notifyAdmins({
    type: 'booking_declined', icon: '❌', color: '#E85C5C',
    title: `Booking declined: ${booking.event_title}`,
    body: `Entertainer declined booking. Reason: ${reason || 'No reason given'}`,
    link: '/admin/bookings',
    metadata: { booking_id: booking.id },
  });
};

const onBookingCancelledByOwner = async (booking, entertainerUserId) => {
  await notifyAdmins({
    type: 'booking_cancelled', icon: '🚫', color: '#F5C842',
    title: `Booking cancelled: ${booking.event_title}`,
    body: `Owner cancelled this booking.`,
    link: '/admin/bookings',
    metadata: { booking_id: booking.id },
  });
  if (entertainerUserId) {
    await createNotification(entertainerUserId, {
      type: 'booking_cancelled', icon: '🚫', color: '#F5C842',
      title: `Booking cancelled: ${booking.event_title}`,
      body: `The show owner cancelled this booking.`,
      link: '/model/bookings',
      metadata: { booking_id: booking.id },
    });
  }
};

const onBookingCancelledByEntertainer = async (booking, ownerId, penalty) => {
  await createNotification(ownerId, {
    type: 'booking_cancelled', icon: '🚫', color: '#F5C842',
    title: `Booking cancelled: ${booking.event_title}`,
    body: `The entertainer cancelled this booking. You have been refunded.`,
    link: '/owner/bookings',
    metadata: { booking_id: booking.id },
  });
  await notifyAdmins({
    type: 'booking_cancelled', icon: '🚫', color: '#F5C842',
    title: `Booking cancelled by entertainer: ${booking.event_title}`,
    body: `Entertainer cancelled. Owner refunded.${penalty > 0 ? ` Penalty collected: ₦${penalty}` : ''}`,
    link: '/admin/bookings',
    metadata: { booking_id: booking.id },
  });
};

const onCancellationRequested = async (booking) => {
  await notifyAdmins({
    type: 'cancellation_requested', icon: '⚠️', color: '#F5C842',
    title: `Cancellation request: ${booking.event_title}`,
    body: `Owner requested cancellation. Tier: ${booking.refund_tier}. Refund: ₦${booking.refund_amount}`,
    link: '/admin/bookings',
    metadata: { booking_id: booking.id },
  });
};

const onCancellationReviewed = async (booking, ownerId, approved, refundAmount) => {
  await createNotification(ownerId, {
    type: approved ? 'cancellation_approved' : 'cancellation_denied',
    icon: approved ? '✅' : '❌',
    color: approved ? '#2ECC8A' : '#E85C5C',
    title: `Cancellation ${approved ? 'approved' : 'denied'}: ${booking.event_title}`,
    body: approved
      ? `Your cancellation was approved.${refundAmount > 0 ? ` ₦${refundAmount} has been credited to your wallet.` : ' No refund applicable.'}`
      : `Your cancellation request was denied.`,
    link: '/owner/bookings',
    metadata: { booking_id: booking.id },
  });
};

// ── PAYMENT EVENTS ────────────────────────────────────────────────────────────
const onPaymentMade = async (booking, entertainerUserId) => {
  await notifyAdmins({
    type: 'payment_made', icon: '💰', color: '#2ECC8A',
    title: `Payment received: ${booking.event_title}`,
    body: `Owner paid ₦${booking.total_amount} for this booking.`,
    link: '/admin/payments',
    metadata: { booking_id: booking.id },
  });
  await createNotification(entertainerUserId, {
    type: 'payment_made', icon: '💰', color: '#2ECC8A',
    title: `Payment received: ${booking.event_title}`,
    body: `The owner has paid for your booking. Funds held in escrow until event completion.`,
    link: '/model/bookings',
    metadata: { booking_id: booking.id },
  });
};

const onPayoutReleased = async (entertainerUserId, amount, bookingTitle) => {
  await createNotification(entertainerUserId, {
    type: 'payout_released', icon: '🏆', color: '#C9A84C',
    title: `Payout released: ${bookingTitle}`,
    body: `₦${amount} has been credited to your wallet.`,
    link: '/model/wallet',
    metadata: { amount },
  });
};

// ── KYC EVENTS ───────────────────────────────────────────────────────────────
const onKYCSubmitted = async (userId) => {
  await notifyAdmins({
    type: 'kyc_submitted', icon: '🛡️', color: '#5B8DEF',
    title: 'New KYC submission',
    body: 'A user submitted KYC documents for verification.',
    link: '/admin/kyc',
    metadata: { user_id: userId },
  });
};

const onKYCReviewed = async (userId, approved) => {
  await createNotification(userId, {
    type: approved ? 'kyc_approved' : 'kyc_rejected',
    icon: approved ? '✅' : '❌',
    color: approved ? '#2ECC8A' : '#E85C5C',
    title: `KYC ${approved ? 'approved' : 'rejected'}`,
    body: approved
      ? 'Your identity has been verified. You can now accept bookings.'
      : 'Your KYC was rejected. Please resubmit with correct documents.',
    link: '/owner/kyc',
    metadata: {},
  });
};

// ── WITHDRAWAL EVENTS ─────────────────────────────────────────────────────────
const onWithdrawalRequested = async (userId, amount) => {
  await notifyAdmins({
    type: 'withdrawal_requested', icon: '💸', color: '#F5C842',
    title: 'Withdrawal request',
    body: `An entertainer requested a withdrawal of ₦${amount}.`,
    link: '/admin/withdrawals',
    metadata: { user_id: userId, amount },
  });
};

const onWithdrawalReviewed = async (userId, approved, amount) => {
  await createNotification(userId, {
    type: approved ? 'withdrawal_approved' : 'withdrawal_rejected',
    icon: approved ? '✅' : '❌',
    color: approved ? '#2ECC8A' : '#E85C5C',
    title: `Withdrawal ${approved ? 'approved' : 'rejected'}`,
    body: approved
      ? `Your withdrawal of ₦${amount} has been approved and is being processed.`
      : `Your withdrawal of ₦${amount} was rejected. Please contact support.`,
    link: '/model/wallet',
    metadata: { amount },
  });
};

// ── WALLET EVENTS ─────────────────────────────────────────────────────────────
const onWalletCredited = async (userId, amount, description) => {
  await createNotification(userId, {
    type: 'wallet_credited', icon: '💳', color: '#2ECC8A',
    title: `Wallet credited: ₦${amount}`,
    body: description || 'Your wallet has been credited.',
    link: '/owner/wallet',
    metadata: { amount },
  });
};

// ── REVIEW EVENTS ─────────────────────────────────────────────────────────────
const onNewReview = async (entertainerUserId, reviewerName, rating) => {
  await createNotification(entertainerUserId, {
    type: 'new_review', icon: '⭐', color: '#C9A84C',
    title: `New review from ${reviewerName}`,
    body: `You received a ${rating}-star review.`,
    link: '/model/profile',
    metadata: { rating },
  });
};

// ── MESSAGE EVENTS ────────────────────────────────────────────────────────────
const onNewMessage = async (recipientId, senderName) => {
  await createNotification(recipientId, {
    type: 'new_message', icon: '💬', color: '#5B8DEF',
    title: `New message from ${senderName}`,
    body: 'You have a new unread message.',
    link: null, // set per role on frontend
    metadata: {},
  });
};

module.exports = {
  createNotification, notifyAdmins,
  onNewBooking, onBookingApprovedByAdmin, onBookingRejectedByAdmin,
  onBookingAcceptedByEntertainer, onBookingDeclinedByEntertainer,
  onBookingCancelledByOwner, onBookingCancelledByEntertainer,
  onCancellationRequested, onCancellationReviewed,
  onPaymentMade, onPayoutReleased,
  onKYCSubmitted, onKYCReviewed,
  onWithdrawalRequested, onWithdrawalReviewed,
  onWalletCredited, onNewReview, onNewMessage,
};
