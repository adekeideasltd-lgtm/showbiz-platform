'use strict';

const { Op } = require('sequelize');
const db = require('../models');

// ── GET /api/models/:id/availability ─────────────────────────────────────────
const getAvailability = async (req, res) => {
  try {
    const { month, year } = req.query;
    const where = { model_id: req.params.id };

    if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end   = new Date(parseInt(year), parseInt(month), 0);
      where.date  = { [Op.between]: [start, end] };
    }

    const availability = await db.ModelAvailability.findAll({
      where,
      order: [['date', 'ASC']],
    });

    const mapped = availability.map(a => ({
      ...a.toJSON(),
      status: a.status || (a.is_available ? 'available' : 'unavailable'),
    }));

    return res.json({ status: 'success', data: mapped });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch availability.' });
  }
};

// ── POST /api/models/me/availability — set availability for dates ─────────────
const setAvailability = async (req, res) => {
  try {
    const { dates, status, note } = req.body;
    // dates: array of 'YYYY-MM-DD' strings
    // status: 'available' | 'unavailable' | 'tentative'

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ status: 'error', message: 'dates array is required.' });
    }
    if (!['available','unavailable','tentative'].includes(status)) {
      return res.status(400).json({ status: 'error', message: 'Invalid status.' });
    }

    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const results = await Promise.all(dates.map(async (date) => {
      const [record, created] = await db.ModelAvailability.findOrCreate({
        where: { model_id: profile.id, date },
        defaults: {
          model_id:     profile.id,
          date,
          status:       status,
          is_available: status === 'available',
          note:         note || null
        },
      });
      if (!created) await record.update({
        status,
        is_available: status === 'available',
        note: note || null
      });
      return record;
    }));

    return res.json({
      status:  'success',
      message: dates.length + ' date(s) updated.',
      data:    results,
    });
  } catch (err) {
    console.error('[setAvailability]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to set availability.' });
  }
};

// ── DELETE /api/models/me/availability — clear dates ─────────────────────────
const clearAvailability = async (req, res) => {
  try {
    const { dates } = req.body;
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    if (dates && Array.isArray(dates)) {
      await db.ModelAvailability.destroy({ where: { model_id: profile.id, date: dates } });
    }

    return res.json({ status: 'success', message: 'Availability cleared.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to clear availability.' });
  }
};

// ── GET /api/models/me/availability ──────────────────────────────────────────
const getMyAvailability = async (req, res) => {
  try {
    const { month, year } = req.query;
    const profile = await db.ModelProfile.findOne({ where: { user_id: req.user.id } });
    if (!profile) return res.status(404).json({ status: 'error', message: 'Profile not found.' });

    const where = { model_id: profile.id };
    if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1);
      const end   = new Date(parseInt(year), parseInt(month), 0);
      where.date  = { [Op.between]: [start, end] };
    }

    const availability = await db.ModelAvailability.findAll({
      where, order: [['date', 'ASC']],
    });

    // Map is_available boolean to status string for frontend
    const mapped = availability.map(a => ({
      ...a.toJSON(),
      status: a.status || (a.is_available ? 'available' : 'unavailable'),
    }));

    return res.json({ status: 'success', data: mapped });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch availability.' });
  }
};

module.exports = { getAvailability, setAvailability, clearAvailability, getMyAvailability };
