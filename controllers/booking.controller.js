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
const createBooking = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      model_id, event_title, event_type, event_date,
      event_end_date, event_location, event_details,
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
      admin_notes:       req.body.notes || null,
      reviewed_by_admin: req.user.id,
      reviewed_at_admin: new Date(),
    }, { transaction: t });

    await logStatusChange(booking.id, prev, 'model_review', req.user.id, req.body.notes || 'Approved by admin. Sent to model for review.', t);
    await t.commit();

    try {
      const b = await db.Booking.findByPk(booking.id, { include: [{ model: db.User, as: 'owner' }, { model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user' }] }] });
      if (b?.model?.user && b?.owner) notify.onBookingApprovedByAdmin(b, b.model.user, b.owner).catch(console.error);
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
    await logStatusChange(booking.id, prev, 'cancelled', req.user.id, req.body.reason || 'Cancelled by owner.', t);
    await t.commit();

    return res.json({ status: 'success', message: 'Booking cancelled.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to cancel booking.' });
  }
};

module.exports = {
  createBooking, listBookings, getBooking,
  adminListBookings, adminApproveBooking, adminRejectBooking,
  modelAcceptBooking, modelDeclineBooking,
  completeBooking, cancelBooking,
};
