'use strict';

const notify = require('../utils/email/notifications');

const { v4: uuidv4 } = require('uuid');
const db = require('../models');

const logStatusChange = async (bookingId, fromStatus, toStatus, changedBy, note = null, t = null) => {
  try {
    await db.BookingStatusHistory.create({
      id: uuidv4(), booking_id: bookingId,
      from_status: fromStatus, to_status: toStatus,
      changed_by: changedBy, note,
    }, t ? { transaction: t } : {});
  } catch (err) {
    console.error('[logStatusChange] ERROR:', err.message);
  }
};

// ── POST /api/bookings — showbiz owner creates booking request ────────────────

// ── Helper: update model availability status for a date ──────────────────────
const updateModelAvailability = async (modelId, eventDate, status, t) => {
  try {
    const is_available = status === 'available';
    // Check if record exists first
    const existing = await db.ModelAvailability.findOne({
      where: { model_id: modelId, date: eventDate },
      ...(t ? { transaction: t } : {}),
    });
    if (existing) {
      await existing.update({ status, is_available }, t ? { transaction: t } : {});
    } else {
      await db.ModelAvailability.create({
        model_id: modelId, date: eventDate, status, is_available,
      }, t ? { transaction: t } : {});
    }
  } catch (e) { console.error('[updateModelAvailability]', e.message); }
};

const createBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      model_id, event_title, event_type, event_date,
      event_end_date, event_location, event_lat, event_lng, event_details,
      duration_hours, agreed_rate,
    } = req.body;

    const errors = [];
    if (!model_id)    errors.push('model_id is required.');
    if (!event_title) errors.push('event_title is required.');
    if (!event_date)  errors.push('event_date is required.');
    if (errors.length > 0) { await t.rollback(); return res.status(400).json({ status: 'error', errors }); }

    // Check model exists and is approved
    const modelProfile = await db.ModelProfile.findOne({
      where: { id: model_id, status: 'approved' }, transaction: t,
    });
    if (!modelProfile) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Model not found or not approved.' }); }

    // Check model availability
    const unavailable = await db.ModelAvailability.findOne({
      where: { model_id, date: event_date, is_available: false }, transaction: t,
    });
    if (unavailable) { await t.rollback(); return res.status(409).json({ status: 'error', message: 'Model is not available on this date.' }); }

    // Double-booking prevention
    const existingBooking = await db.Booking.findOne({
      where: {
        model_id:   model_id,
        event_date: event_date,
        status:     { [require('sequelize').Op.notIn]: ['cancelled','rejected_by_admin','rejected_by_model'] },
      },
      transaction: t,
    });
    if (existingBooking) { await t.rollback(); return res.status(409).json({ status: 'error', message: 'Model already has a booking for this date.' }); }

    const total_amount = duration_hours && agreed_rate
      ? parseFloat(duration_hours) * parseFloat(agreed_rate)
      : agreed_rate || null;

    const booking = await db.Booking.create({
      id: uuidv4(),
      owner_id:       req.user.id,
      model_id,
      event_title,
      event_type:     event_type    || null,
      event_date,
      event_end_date: event_end_date || null,
      event_location: event_location || null,
      event_lat: event_lat || null,
      event_lng: event_lng || null,
      event_details:  event_details  || null,
      duration_hours: duration_hours || null,
      agreed_rate:    agreed_rate    || null,
      total_amount,
      status: 'pending',
    }, { transaction: t });

    await logStatusChange(booking.id, null, 'pending', req.user.id, 'Booking request created.', t);
    await t.commit();
    try {
      const owner     = await db.User.findByPk(req.user.id);
      const modelUser = await db.User.findByPk(modelProfile.user_id);
      if (owner && modelUser) notify.onNewBookingAdmin(booking, owner, modelProfile).catch(console.error);
    notify.onBookingCreated(booking, owner, modelUser).catch(console.error);
    } catch (_) {}

    return res.status(201).json({
      status: 'success',
      message: 'Booking request submitted. Awaiting admin review.',
      data: booking,
    });
  } catch (err) {
    await t.rollback();
    console.error('[createBooking] FULL ERROR:', err.message, err.stack);
    return res.status(500).json({ status: 'error', message: 'Failed to create booking.' });
  }
};

// ── GET /api/bookings — list own bookings ─────────────────────────────────────
const listBookings = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};

    if (req.user.roles.includes('showbiz_owner')) where.owner_id = req.user.id;
    if (req.user.roles.includes('model')) {
      const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
      if (profile) where.model_id = profile.id;
    }
    if (status) where.status = status;

    const { count, rows } = await db.Booking.findAndCountAll({
      where,
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order:  [['created_at', 'DESC']],
      include: [
        { model: db.User,         as: 'owner', attributes: ['id','first_name','last_name'] },
        { model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user', attributes: ['id','first_name','last_name'] }] },
      ],
    });

    return res.json({
      status: 'success',
      data: { bookings: rows, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) } },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch bookings.' });
  }
};

// ── GET /api/bookings/:id ─────────────────────────────────────────────────────
const getBooking = async (req, res) => {
  try {
    const booking = await db.Booking.findByPk(req.params.id, {
      include: [
        { model: db.User,         as: 'owner', attributes: ['id','first_name','last_name'] },
        { model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user', attributes: ['id','first_name','last_name'] }] },
        { model: db.BookingStatusHistory, as: 'statusHistory', order: [['created_at','ASC']] },
      ],
    });

    if (!booking) return res.status(404).json({ status: 'error', message: 'Booking not found.' });

    // Access control — only owner, model, or admin can view
    const isAdmin = req.user.isSuperAdmin || ['admin','manager','moderator'].some(r => req.user.roles.includes(r));
    const isOwner = booking.owner_id === req.user.id;
    const modelProfile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    const isModel = modelProfile && booking.model_id === modelProfile.id;

    if (!isAdmin && !isOwner && !isModel) {
      return res.status(403).json({ status: 'error', message: 'Access denied.' });
    }

    return res.json({ status: 'success', data: booking });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch booking.' });
  }
};

// ── ADMIN: GET /api/admin/bookings ────────────────────────────────────────────
const adminListBookings = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = {};
    if (status === 'rejected') {
      where.status = { [require('sequelize').Op.in]: ['rejected_by_admin', 'rejected_by_model'] };
    } else if (status) {
      where.status = status;
    }

    const { count, rows } = await db.Booking.findAndCountAll({
      where,
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order:  [['created_at', 'DESC']],
      include: [
        { model: db.User,         as: 'owner', attributes: ['id','first_name','last_name'] },
        { model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user', attributes: ['id','first_name','last_name'] }] },
      ],
    });

    return res.json({
      status: 'success',
      data: { bookings: rows, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) } },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch bookings.' });
  }
};

// ── ADMIN: POST /api/admin/bookings/:id/approve ───────────────────────────────
const adminApproveBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.status !== 'pending') { await t.rollback(); return res.status(400).json({ status: 'error', message: `Cannot approve a booking with status: ${booking.status}` }); }

    const prev = booking.status;
    await booking.update({
      status: 'model_review',
      admin_notes:       req.body?.notes || null,
      reviewed_by_admin: req.user.id,
      reviewed_at_admin: new Date(),
    }, { transaction: t });

    await logStatusChange(booking.id, prev, 'model_review', req.user.id, req.body?.notes || 'Approved by admin. Sent to model for review.', t);
    await t.commit();

    try {
      const b = await db.Booking.findByPk(booking.id, { include: [{ model: db.User, as: 'owner' }, { model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user' }] }] });
      if (b?.model?.user && b?.owner) {
        notify.onBookingApprovedByAdmin(b, b.model.user, b.owner).catch(console.error);
      } else {
        console.error('[approveBooking] Missing data - model user:', !!b?.model?.user, 'owner:', !!b?.owner);
      }
    } catch (_) {}
    return res.json({ status: 'success', message: 'Booking approved and sent to model for response.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to approve booking.' });
  }
};

// ── ADMIN: POST /api/admin/bookings/:id/reject ────────────────────────────────
const adminRejectBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { reason } = req.body;
    if (!reason) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Rejection reason is required.' }); }

    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }

    const prev = booking.status;
    await booking.update({ status: 'rejected_by_admin', rejection_reason: reason }, { transaction: t });
    await logStatusChange(booking.id, prev, 'rejected_by_admin', req.user.id, reason, t);
    await t.commit();

    return res.json({ status: 'success', message: 'Booking rejected.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to reject booking.' });
  }
};

// ── MODEL: POST /api/bookings/:id/accept ─────────────────────────────────────
const modelAcceptBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.status !== 'model_review') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Booking is not awaiting your response.' }); }

    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!profile || booking.model_id !== profile.id) { await t.rollback(); return res.status(403).json({ status: 'error', message: 'This booking is not for you.' }); }

    const prev = booking.status;
    await updateModelAvailability(booking.model_id, booking.event_date, 'booked', t);
    await booking.update({ status: 'confirmed', model_response_at: new Date() }, { transaction: t });
    await logStatusChange(booking.id, prev, 'confirmed', req.user.id, 'Accepted by model.', t);
    await t.commit();

    try {
      const b = await db.Booking.findByPk(booking.id, { include: [{ model: db.User, as: 'owner' }] });
      const modelUser = await db.User.findByPk(req.user.id);
      if (b?.owner && modelUser) notify.onBookingConfirmedByModel(b, b.owner, modelUser).catch(console.error);
    } catch (_) {}
    return res.json({ status: 'success', message: 'Booking confirmed! The event is locked in.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to accept booking.' });
  }
};

// ── MODEL: POST /api/bookings/:id/decline ─────────────────────────────────────
const modelDeclineBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { reason } = req.body;
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.status !== 'model_review') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Booking is not awaiting your response.' }); }

    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!profile || booking.model_id !== profile.id) { await t.rollback(); return res.status(403).json({ status: 'error', message: 'This booking is not for you.' }); }

    const prev = booking.status;
    await booking.update({ status: 'rejected_by_model', rejection_reason: reason || null, model_response_at: new Date() }, { transaction: t });
    await logStatusChange(booking.id, prev, 'rejected_by_model', req.user.id, reason || 'Declined by model.', t);
    await t.commit();

    try {
      const b = await db.Booking.findByPk(booking.id, { include: [{ model: db.User, as: 'owner' }] });
      const modelUser = await db.User.findByPk(req.user.id);
      if (b?.owner && modelUser) notify.onBookingDeclinedByModel(b, b.owner, modelUser, reason).catch(console.error);
    } catch (_) {}
    return res.json({ status: 'success', message: 'Booking declined.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to decline booking.' });
  }
};

// ── ADMIN: POST /api/admin/bookings/:id/complete ──────────────────────────────
const completeBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.status !== 'confirmed') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Only confirmed bookings can be marked complete.' }); }

    const prev = booking.status;
    await booking.update({ status: 'completed', completed_at: new Date() }, { transaction: t });
    await logStatusChange(booking.id, prev, 'completed', req.user.id, 'Event completed.', t);
    await updateModelAvailability(booking.model_id, booking.event_date, 'available', t);
    await t.commit();

    return res.json({ status: 'success', message: 'Booking marked as completed.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to complete booking.' });
  }
};

// ── OWNER: POST /api/bookings/:id/cancel ─────────────────────────────────────
const cancelBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.owner_id !== req.user.id) { await t.rollback(); return res.status(403).json({ status: 'error', message: 'You can only cancel your own bookings.' }); }

    const cancellable = ['pending','model_review'];
    if (!cancellable.includes(booking.status)) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: `Cannot cancel a booking with status: ${booking.status}` });
    }

    const prev = booking.status;
    await booking.update({ status: 'cancelled' }, { transaction: t });
    await logStatusChange(booking.id, prev, 'cancelled', req.user.id, req.body?.reason || 'Cancelled by owner.', t);
    await updateModelAvailability(booking.model_id, booking.event_date, 'available', t);
    await t.commit();

    return res.json({ status: 'success', message: 'Booking cancelled.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to cancel booking.' });
  }
};


// ── OWNER: POST /api/bookings/:id/request-cancellation ────────────────────────
const requestCancellation = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { reason } = req.body;
    if (!reason) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Cancellation reason is required.' }); }
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.owner_id !== req.user.id) { await t.rollback(); return res.status(403).json({ status: 'error', message: 'You can only cancel your own bookings.' }); }

    // Pre-payment statuses cancel immediately, no refund needed
    if (['pending','model_review'].includes(booking.status)) {
      const prev = booking.status;
      await booking.update({ status: 'cancelled' }, { transaction: t });
      await logStatusChange(booking.id, prev, 'cancelled', req.user.id, reason, t);
      await updateModelAvailability(booking.model_id, booking.event_date, 'available', t);
      await t.commit();
      return res.json({ status: 'success', message: 'Booking cancelled.' });
    }

    // Post-payment: must go through cancellation request/refund tier flow
    if (!['confirmed','paid'].includes(booking.status)) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: `Cannot cancel a booking with status: ${booking.status}` });
    }
    if (booking.cancellation_status === 'requested') {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'A cancellation request is already pending for this booking.' });
    }

    // Calculate refund tier based on time-to-event
    const eventDate = new Date(booking.event_date);
    const now = new Date();
    const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);

    let tier, refundPercent;
    if (hoursUntilEvent >= 48) { tier = 'full'; refundPercent = 0.90; }
    else if (hoursUntilEvent >= 24) { tier = 'partial'; refundPercent = 0.50; }
    else { tier = 'none'; refundPercent = 0; }

    const refundAmount = booking.status === 'paid'
      ? parseFloat((parseFloat(booking.total_amount) * refundPercent).toFixed(2))
      : 0;

    await booking.update({
      cancellation_status: 'requested',
      cancellation_reason: reason,
      cancellation_requested_at: now,
      refund_tier: tier,
      refund_amount: refundAmount,
    }, { transaction: t });

    await logStatusChange(booking.id, booking.status, booking.status, req.user.id,
      `Cancellation requested: ${reason} (tier: ${tier}, refund: ₦${refundAmount})`, t);

    await t.commit();
    return res.json({ status: 'success', message: 'Cancellation request submitted for admin review.', data: { tier, refundAmount } });
  } catch (err) {
    await t.rollback();
    console.error('[requestCancellation] ERROR:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to request cancellation.' });
  }
};

// ── ADMIN: POST /api/admin/bookings/:id/review-cancellation ──────────────────
const reviewCancellation = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { approve, admin_notes } = req.body;
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    if (booking.cancellation_status !== 'requested') {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'No pending cancellation request for this booking.' });
    }

    if (!approve) {
      await booking.update({ cancellation_status: 'denied', admin_notes }, { transaction: t });
      await logStatusChange(booking.id, booking.status, booking.status, req.user.id, `Cancellation request denied. ${admin_notes || ''}`, t);
      await t.commit();
      return res.json({ status: 'success', message: 'Cancellation request denied.' });
    }

    const prev = booking.status;
    const refundAmount = parseFloat(booking.refund_amount || 0);
    const { creditWallet } = require('./wallet.controller');

    if (refundAmount > 0) {
      await creditWallet(booking.owner_id, refundAmount,
        `Booking cancellation refund — ${booking.event_title} (${booking.refund_tier} tier)`,
        `refund-${booking.id}`, { booking_id: booking.id }, t);
    }

    // No-refund tier: pay entertainer a kill fee for the reserved slot
    if (booking.refund_tier === 'none' && booking.status === 'paid') {
      const { getSetting } = require('./settings.controller');
      const RATE = await getSetting('commission_rate', 10);
      const totalAmount = parseFloat(booking.total_amount);
      const commission  = parseFloat((totalAmount * RATE / 100).toFixed(2));
      const killFee     = parseFloat((totalAmount - commission).toFixed(2));

      const modelProfile = await db.ModelProfile.findByPk(booking.model_id, { transaction: t });
      if (modelProfile) {
        await creditWallet(modelProfile.user_id, killFee,
          `Booking payout (kill fee) — ${booking.event_title} cancelled <24hrs, no refund issued`,
          `killfee-${booking.id}`, { booking_id: booking.id }, t);
      }
    }

    // Partial-refund tier: remaining balance after owner refund + standard commission
    // goes to a separate cancellation collection ledger (entertainer gets nothing)
    if (booking.refund_tier === 'partial' && booking.status === 'paid') {
      const { getSetting } = require('./settings.controller');
      const RATE = await getSetting('commission_rate', 10);
      const totalAmount = parseFloat(booking.total_amount);
      const commission  = parseFloat((totalAmount * RATE / 100).toFixed(2));
      const collectionAmount = parseFloat((totalAmount - refundAmount - commission).toFixed(2));

      if (collectionAmount > 0) {
        const superAdmin = await db.User.findOne({ where: { email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@showbiz.ng' }, transaction: t });
        if (superAdmin) {
          await creditWallet(superAdmin.id, collectionAmount,
            `Cancellation collection — ${booking.event_title} (partial tier, 24-48hr cancellation)`,
            `cancel-collection-${booking.id}`, { booking_id: booking.id }, t);
        }
      }
    }

    await booking.update({
      status: 'cancelled',
      cancellation_status: 'approved',
      admin_notes,
    }, { transaction: t });
    await logStatusChange(booking.id, prev, 'cancelled', req.user.id,
      `Cancellation approved. Refund: ₦${refundAmount} (${booking.refund_tier} tier). ${admin_notes || ''}`, t);
    await updateModelAvailability(booking.model_id, booking.event_date, 'available', t);

    await t.commit();
    return res.json({ status: 'success', message: 'Cancellation approved and refund processed.', data: { refundAmount } });
  } catch (err) {
    await t.rollback();
    console.error('[reviewCancellation] ERROR:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to review cancellation.' });
  }
};


// ── MODEL: POST /api/bookings/:id/model-cancel ────────────────────────────────
const modelCancelBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { reason } = req.body;
    if (!reason) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Cancellation reason is required.' }); }
    const booking = await db.Booking.findByPk(req.params.id, { transaction: t });
    if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!profile || booking.model_id !== profile.id) { await t.rollback(); return res.status(403).json({ status: 'error', message: 'This booking is not for you.' }); }
    if (!['confirmed','paid'].includes(booking.status)) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: `Cannot cancel a booking with status: ${booking.status}` });
    }

    const eventDate = new Date(booking.event_date);
    const now = new Date();
    const hoursUntilEvent = (eventDate - now) / (1000 * 60 * 60);
    const totalAmount = parseFloat(booking.total_amount);
    const isPaid = booking.status === 'paid';
    const isLate = hoursUntilEvent < 24;

    const { creditWallet } = require('./wallet.controller');

    // Full refund to owner if booking was paid
    if (isPaid) {
      await creditWallet(booking.owner_id, totalAmount,
        `Booking cancellation refund — ${booking.event_title} (cancelled by entertainer)`,
        `model-cancel-refund-${booking.id}`, { booking_id: booking.id }, t);
    }

    // 20% penalty on the model if cancelled within 24 hours of the event
    // Debited regardless of balance (can go negative)
    let penaltyAmount = 0;
    if (isLate) {
      penaltyAmount = parseFloat((totalAmount * 0.20).toFixed(2));

      const wallet = await db.Wallet.findOne({ where: { user_id: req.user.id }, transaction: t });
      const balanceBefore = wallet ? parseFloat(wallet.balance) : 0;
      const balanceAfter = balanceBefore - penaltyAmount;

      if (wallet) {
        await wallet.update({ balance: balanceAfter }, { transaction: t });
      } else {
        await db.Wallet.create({
          user_id: req.user.id, balance: balanceAfter, locked: 0, currency: 'NGN',
        }, { transaction: t });
      }

      await db.WalletTransaction.create({
        wallet_id: wallet ? wallet.id : (await db.Wallet.findOne({ where: { user_id: req.user.id }, transaction: t })).id,
        user_id: req.user.id,
        type: 'debit',
        amount: penaltyAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `Late cancellation penalty (20%) — ${booking.event_title}`,
        reference: `model-late-penalty-${booking.id}`,
        status: 'success',
        metadata: { booking_id: booking.id },
      }, { transaction: t });

      const superAdmin = await db.User.findOne({ where: { email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@showbiz.ng' }, transaction: t });
      if (superAdmin) {
        await creditWallet(superAdmin.id, penaltyAmount,
          `Late cancellation penalty collected — ${booking.event_title} (entertainer cancelled <24hrs)`,
          `penalty-collection-${booking.id}`, { booking_id: booking.id }, t);
      }
    }

    const prev = booking.status;
    await booking.update({
      status: 'cancelled',
      cancellation_status: 'approved',
      cancellation_reason: reason,
      refund_amount: isPaid ? totalAmount : 0,
      refund_tier: isLate ? 'model_late_cancel' : 'model_cancel',
    }, { transaction: t });

    await logStatusChange(booking.id, prev, 'cancelled', req.user.id,
      `Cancelled by entertainer: ${reason}${isLate ? ` (late cancellation — 20% penalty: ₦${penaltyAmount})` : ''}`, t);

    await updateModelAvailability(booking.model_id, booking.event_date, 'available', t);

    await t.commit();
    return res.json({ status: 'success', message: 'Booking cancelled.', data: { refunded: isPaid ? totalAmount : 0, penalty: penaltyAmount } });
  } catch (err) {
    await t.rollback();
    console.error('[modelCancelBooking] ERROR:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to cancel booking.' });
  }
};

module.exports = {
  createBooking, listBookings, getBooking,
  adminListBookings, adminApproveBooking, adminRejectBooking,
  modelAcceptBooking, modelDeclineBooking,
  completeBooking, cancelBooking,
  requestCancellation, reviewCancellation, modelCancelBooking,
};
