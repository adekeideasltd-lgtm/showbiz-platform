'use strict';
const db = require('../models');
const { Op } = require('sequelize');

// ── POST /api/reviews ─────────────────────────────────────────────────────────
const createReview = async (req, res) => {
  try {
    const { booking_id, rating, title, comment } = req.body;
    if (!booking_id || !rating)
      return res.status(400).json({ status: 'error', message: 'booking_id and rating required.' });
    if (rating < 1 || rating > 5)
      return res.status(400).json({ status: 'error', message: 'Rating must be between 1 and 5.' });

    // Verify booking belongs to reviewer and is completed
    const booking = await db.Booking.findOne({
      where: { id: booking_id, owner_id: req.user.id, status: 'completed' },
    });
    if (!booking)
      return res.status(403).json({ status: 'error', message: 'You can only review completed bookings.' });

    // Check no duplicate review
    const existing = await db.Review.findOne({ where: { booking_id } });
    if (existing)
      return res.status(400).json({ status: 'error', message: 'You have already reviewed this booking.' });

    const review = await db.Review.create({
      booking_id,
      reviewer_id: req.user.id,
      model_id:    booking.model_id,
      rating:      parseInt(rating),
      title:       title || null,
      comment:     comment || null,
    });

    // Update model average rating
    await updateModelRating(booking.model_id);

    // Notify model
    require('./push.controller').sendPushToUser(
      booking.model_id,
      { title: '⭐ New Review!', body: `You received a ${rating}-star review`, url: '/model/profile' }
    ).catch(() => {});

    return res.status(201).json({ status: 'success', message: 'Review submitted.', data: review });
  } catch (err) {
    console.error('[createReview]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to submit review.' });
  }
};

// ── Helper: update model average rating ──────────────────────────────────────
const updateModelRating = async (modelId) => {
  const reviews = await db.Review.findAll({
    where: { model_id: modelId, is_visible: true },
    attributes: ['rating'],
  });
  if (reviews.length === 0) return;
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  await db.ModelProfile.update(
    { average_rating: parseFloat(avg.toFixed(1)), total_reviews: reviews.length },
    { where: { id: modelId } }
  );
};

// ── GET /api/reviews/model/:modelId ──────────────────────────────────────────
const getModelReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const { count, rows } = await db.Review.findAndCountAll({
      where: { model_id: req.params.modelId, is_visible: true },
      include: [{ model: db.User, as: 'reviewer', attributes: ['first_name', 'last_name'] }],
      order: [['created_at', 'DESC']],
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    return res.json({ status: 'success', data: { reviews: rows, total: count, page: parseInt(page) } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch reviews.' });
  }
};

// ── GET /api/reviews/booking/:bookingId ───────────────────────────────────────
const getBookingReview = async (req, res) => {
  try {
    const review = await db.Review.findOne({ where: { booking_id: req.params.bookingId } });
    return res.json({ status: 'success', data: review || null });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── GET /api/admin/reviews ────────────────────────────────────────────────────
const adminListReviews = async (req, res) => {
  try {
    const reviews = await db.Review.findAll({
      include: [
        { model: db.User, as: 'reviewer', attributes: ['first_name', 'last_name', 'email'] },
        { model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user', attributes: ['first_name', 'last_name'] }] },
      ],
      order: [['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: reviews });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── PUT /api/admin/reviews/:id/toggle ─────────────────────────────────────────
const adminToggleReview = async (req, res) => {
  try {
    const review = await db.Review.findByPk(req.params.id);
    if (!review) return res.status(404).json({ status: 'error', message: 'Not found.' });
    await review.update({ is_visible: !review.is_visible });
    await updateModelRating(review.model_id);
    return res.json({ status: 'success', message: review.is_visible ? 'Review hidden.' : 'Review visible.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

module.exports = { createReview, getModelReviews, getBookingReview, adminListReviews, adminToggleReview };
