'use strict';
const { Op } = require('sequelize');
const db = require('../models');

// ── GET /api/announcements — public (filtered by role) ────────────────────────
const listAnnouncements = async (req, res) => {
  try {
    const roles = req.user?.roles || [];
    const isAdmin = req.user?.isSuperAdmin || roles.some(r => ['admin','manager','moderator'].includes(r));
    const isModel = roles.includes('model');
    const isOwner = roles.includes('showbiz_owner');

    const audienceFilter = ['all'];
    if (isAdmin) audienceFilter.push('admins');
    if (isModel) audienceFilter.push('models');
    if (isOwner) audienceFilter.push('owners');

    const where = {
      is_active:  true,
      audience:   { [Op.in]: audienceFilter },
      [Op.or]: [
        { expires_at: null },
        { expires_at: { [Op.gt]: new Date() } },
      ],
    };

    const announcements = await db.Announcement.findAll({
      where,
      order: [['is_pinned', 'DESC'], ['created_at', 'DESC']],
      limit: 20,
    });

    return res.json({ status: 'success', data: announcements });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch announcements.' });
  }
};

// ── GET /api/admin/announcements ──────────────────────────────────────────────
const adminList = async (req, res) => {
  try {
    const announcements = await db.Announcement.findAll({
      include: [{ model: db.User, as: 'creator', attributes: ['first_name', 'last_name'] }],
      order: [['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: announcements });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

// ── POST /api/admin/announcements ─────────────────────────────────────────────
const adminCreate = async (req, res) => {
  try {
    const { title, message, type, audience, is_pinned, expires_at } = req.body;
    if (!title || !message)
      return res.status(400).json({ status: 'error', message: 'Title and message required.' });

    const announcement = await db.Announcement.create({
      title, message,
      type:       type       || 'info',
      audience:   audience   || 'all',
      is_pinned:  is_pinned  || false,
      expires_at: expires_at || null,
      created_by: req.user.id,
    });

    // Send email notification to target audience
    const notify = require('../utils/email/notifications');
    if (notify.onAnnouncement) {
      notify.onAnnouncement(announcement, req.user).catch(console.error);
    }

    console.log('[Announcement] Created by', req.user.email, '— audience:', audience);
    return res.status(201).json({ status: 'success', message: 'Announcement created.', data: announcement });
  } catch (err) {
    console.error('[adminCreate]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to create announcement.' });
  }
};

// ── PUT /api/admin/announcements/:id ─────────────────────────────────────────
const adminUpdate = async (req, res) => {
  try {
    const ann = await db.Announcement.findByPk(req.params.id);
    if (!ann) return res.status(404).json({ status: 'error', message: 'Not found.' });
    await ann.update(req.body);
    return res.json({ status: 'success', message: 'Updated.', data: ann });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update.' });
  }
};

// ── DELETE /api/admin/announcements/:id ───────────────────────────────────────
const adminDelete = async (req, res) => {
  try {
    const ann = await db.Announcement.findByPk(req.params.id);
    if (!ann) return res.status(404).json({ status: 'error', message: 'Not found.' });
    await ann.destroy();
    return res.json({ status: 'success', message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to delete.' });
  }
};

module.exports = { listAnnouncements, adminList, adminCreate, adminUpdate, adminDelete };
