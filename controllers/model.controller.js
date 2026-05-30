'use strict';

const notify = require('../utils/email/notifications');

const { v4: uuidv4 } = require('uuid');
const db = require('../models');

// ── GET /api/models — public browse (approved only) ───────────────────────────
const listModels = async (req, res) => {
  try {
    const {
      page = 1, limit = 20,
      gender, experience, city, country,
      min_rate, max_rate, specialty,
    } = req.query;

    const where = { status: 'approved' };
    if (gender)     where.gender     = gender;
    if (experience) where.experience = experience;
    if (city)       where.city       = city;
    if (country)    where.country    = country;

    if (min_rate || max_rate) {
      const { Op } = require('sequelize');
      where.hourly_rate = {};
      if (min_rate) where.hourly_rate[Op.gte] = parseFloat(min_rate);
      if (max_rate) where.hourly_rate[Op.lte] = parseFloat(max_rate);
    }

    const { count, rows } = await db.ModelProfile.findAndCountAll({
      where,
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order:  [['is_featured', 'DESC'], ['created_at', 'DESC']],
      include: [
        {
          model: db.User,
          as: 'user',
          attributes: ['id', 'first_name', 'last_name'],
        },
        {
          model: db.ModelPhoto,
          as: 'photos',
          where: { is_primary: true, is_approved: true },
          required: false,
          attributes: ['url', 'caption'],
        },
      ],
    });

    return res.json({
      status: 'success',
      data: {
        models: rows,
        pagination: {
          total: count,
          page:  parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    console.error('[listModels]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch models.' });
  }
};

// ── GET /api/models/:id — single model public profile ─────────────────────────
const getModel = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({
      where: { id: req.params.id },
      include: [
        { model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'kyc_verified'] },
        { model: db.ModelPhoto, as: 'photos', where: { is_approved: true }, required: false },
      ],
    });

    if (!profile) return res.status(404).json({ status: 'error', message: 'Model not found.' });

    // Hide pricing from public — only logged-in showbiz owners / admins see it
    const isPrivileged = req.user && (
      req.user.isSuperAdmin ||
      req.user.roles.includes('admin') ||
      req.user.roles.includes('manager') ||
      req.user.roles.includes('showbiz_owner')
    );

    const data = profile.toJSON();
    if (!isPrivileged) {
      delete data.hourly_rate;
      delete data.daily_rate;
    }

    return res.json({ status: 'success', data });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch model.' });
  }
};

// ── GET /api/models/me — own profile ─────────────────────────────────────────
const getMyProfile = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({
      where: { user_id: req.user.id },
      include: [
        { model: db.ModelPhoto, as: 'photos', required: false },
        { model: db.ModelAvailability, as: 'availability', required: false },
      ],
    });

    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found. Please complete your registration.' });
    return res.json({ status: 'success', data: profile });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch profile.' });
  }
};

// ── PUT /api/models/me — update own profile ───────────────────────────────────
const updateMyProfile = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const allowed = [
      'bio','phone','country','state','city',
      'height_cm','weight_kg','skin_tone','gender','experience',
      'languages','specialties','hobbies','hourly_rate','daily_rate',
    ];

    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    await profile.update(updates);
    return res.json({ status: 'success', message: 'Profile updated.', data: profile });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update profile.' });
  }
};

// ── POST /api/models/me/photos — add photo URL ────────────────────────────────
const addPhoto = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const { url, caption, is_primary } = req.body;
    if (!url) return res.status(400).json({ status: 'error', message: 'Photo URL is required.' });

    // If setting as primary, unset all others
    if (is_primary) {
      await db.ModelPhoto.update({ is_primary: false }, { where: { model_id: profile.id } });
    }

    const photo = await db.ModelPhoto.create({
      id:         uuidv4(),
      model_id:   profile.id,
      url,
      caption:    caption || null,
      is_primary: is_primary || false,
      is_approved: false,
    });

    return res.status(201).json({ status: 'success', message: 'Photo added. Awaiting admin approval.', data: photo });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to add photo.' });
  }
};

// ── DELETE /api/models/me/photos/:photoId ─────────────────────────────────────
const deletePhoto = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const photo = await db.ModelPhoto.findOne({ where: { id: req.params.photoId, model_id: profile.id } });
    if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found.' });

    await photo.destroy();
    return res.json({ status: 'success', message: 'Photo deleted.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to delete photo.' });
  }
};

// ── POST /api/models/me/availability — set availability dates ─────────────────
const setAvailability = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const { dates } = req.body;
    if (!Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ status: 'error', message: 'dates array is required. e.g. [{"date":"2024-12-25","is_available":true}]' });
    }

    const results = [];
    for (const entry of dates) {
      const [record, created] = await db.ModelAvailability.findOrCreate({
        where: { model_id: profile.id, date: entry.date },
        defaults: {
          id:           uuidv4(),
          model_id:     profile.id,
          date:         entry.date,
          is_available: entry.is_available !== false,
          note:         entry.note || null,
        },
      });
      if (!created) await record.update({ is_available: entry.is_available !== false, note: entry.note || null });
      results.push(record);
    }

    return res.json({ status: 'success', message: `${results.length} availability date(s) updated.`, data: results });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to set availability.' });
  }
};

// ── GET /api/models/:id/availability — check availability ────────────────────
const getAvailability = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findByPk(req.params.id);
    if (!profile) return res.status(404).json({ status: 'error', message: 'Model not found.' });

    const { from, to } = req.query;
    const where = { model_id: profile.id, is_available: true };

    if (from || to) {
      const { Op } = require('sequelize');
      where.date = {};
      if (from) where.date[Op.gte] = from;
      if (to)   where.date[Op.lte] = to;
    }

    const availability = await db.ModelAvailability.findAll({
      where,
      order: [['date', 'ASC']],
    });

    return res.json({ status: 'success', data: availability });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch availability.' });
  }
};

// ── ADMIN: GET /api/admin/models — all models with status filter ──────────────
const adminListModels = async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const where = {};
    if (status !== 'all') where.status = status;

    const { count, rows } = await db.ModelProfile.findAndCountAll({
      where,
      limit:  parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order:  [['created_at', 'DESC']],
      include: [
        { model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name'] },
        { model: db.ModelPhoto, as: 'photos', required: false, where: { is_approved: true }, },
      ],
    });

    return res.json({
      status: 'success',
      data: { models: rows, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) } },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch models.' });
  }
};

// ── ADMIN: POST /api/admin/models/:id/approve ─────────────────────────────────
const approveModel = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'user', attributes: ['id', 'first_name', 'email'] }],
    });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Model not found.' });

    await profile.update({
      status:      'approved',
      approved_by: req.user.id,
      approved_at: new Date(),
      rejected_reason: null,
    });

    notify.onModelApproved(profile.user).catch(console.error);
    // Approve all pending photos too
    await db.ModelPhoto.update({ is_approved: true }, { where: { model_id: profile.id } });

    return res.json({
      status: 'success',
      message: `Model ${profile.user.first_name} approved and is now visible on the platform.`,
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to approve model.' });
  }
};

// ── ADMIN: POST /api/admin/models/:id/reject ──────────────────────────────────
const rejectModel = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ status: 'error', message: 'Rejection reason is required.' });

    const profile = await db.ModelProfile.findByPk(req.params.id);
    if (!profile) return res.status(404).json({ status: 'error', message: 'Model not found.' });

    await profile.update({ status: 'rejected', rejected_reason: reason });
    db.User.findByPk(profile.user_id).then(u => { if (u) notify.onModelRejected(u, reason).catch(console.error); });

    return res.json({ status: 'success', message: 'Model rejected.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to reject model.' });
  }
};

// ── ADMIN: POST /api/admin/models/:id/feature ─────────────────────────────────
const featureModel = async (req, res) => {
  try {
    const profile = await db.ModelProfile.findByPk(req.params.id);
    if (!profile) return res.status(404).json({ status: 'error', message: 'Model not found.' });

    await profile.update({ is_featured: !profile.is_featured });
    return res.json({
      status: 'success',
      message: profile.is_featured ? 'Model featured.' : 'Model unfeatured.',
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update featured status.' });
  }
};

// ── ADMIN: POST /api/admin/models/photos/:photoId/approve ─────────────────────
const approvePhoto = async (req, res) => {
  try {
    const photo = await db.ModelPhoto.findByPk(req.params.photoId);
    if (!photo) return res.status(404).json({ status: 'error', message: 'Photo not found.' });
    await photo.update({ is_approved: true });
    return res.json({ status: 'success', message: 'Photo approved.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to approve photo.' });
  }
};

// ── GET /api/admin/models/:id/photos ─────────────────────────────────────────
const adminGetModelPhotos = async (req, res) => {
  try {
    const photos = await db.ModelPhoto.findAll({
      where: { model_id: req.params.id },
      order: [['is_primary', 'DESC'], ['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: photos });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch photos.' });
  }
};

module.exports = {
  listModels, getModel, getMyProfile, updateMyProfile, adminGetModelPhotos,
  addPhoto, deletePhoto, setAvailability, getAvailability,
  adminListModels, approveModel, rejectModel, featureModel, approvePhoto,
};
