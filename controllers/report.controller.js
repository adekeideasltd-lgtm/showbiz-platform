'use strict';
const db      = require('../models');
const multer  = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../utils/cloudinary');

// ── Cloudinary storage for report attachments ─────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => ({
    folder: 'showbiz/reports/' + req.user.id,
    public_id: file.fieldname + '_' + Date.now(),
    resource_type: file.mimetype.startsWith('audio') ? 'video' : 'auto',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp', 'mp3', 'wav', 'ogg', 'webm', 'm4a'],
  }),
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
}).fields([
  { name: 'attachments', maxCount: 5 },
  { name: 'voice_note',  maxCount: 1 },
]);

// ── POST /api/reports ─────────────────────────────────────────────────────────
const createReport = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ status: 'error', message: err.message });
    try {
      const { type, category, subject, message, related_id, related_type, priority } = req.body;
      if (!type || !category || !subject || !message)
        return res.status(400).json({ status: 'error', message: 'type, category, subject and message are required.' });

      const files = req.files || {};

      // Process attachments
      const attachments = (files.attachments || []).map(f => ({
        url:        f.path,
        public_id:  f.filename,
        name:       f.originalname,
        type:       f.mimetype,
        size:       f.size,
      }));

      // Process voice note
      let voice_note_url = null, voice_note_public_id = null;
      if (files.voice_note?.[0]) {
        voice_note_url       = files.voice_note[0].path;
        voice_note_public_id = files.voice_note[0].filename;
      }

      const report = await db.Report.create({
        user_id: req.user.id,
        type, category, subject, message,
        related_id:   related_id   || null,
        related_type: related_type || null,
        priority:     priority     || 'medium',
        attachments,
        voice_note_url,
        voice_note_public_id,
      });

      console.log('[Report] Created by', req.user.email, '— type:', type);
      return res.status(201).json({ status: 'success', message: 'Report submitted successfully.', data: report });
    } catch (err) {
      console.error('[createReport]', err.message);
      return res.status(500).json({ status: 'error', message: 'Failed to submit report.' });
    }
  });
};

// ── GET /api/reports/me ───────────────────────────────────────────────────────
const getMyReports = async (req, res) => {
  try {
    const reports = await db.Report.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: reports });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch reports.' });
  }
};

// ── GET /api/reports/:id ──────────────────────────────────────────────────────
const getReport = async (req, res) => {
  try {
    const report = await db.Report.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [{ model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
    });
    if (!report) return res.status(404).json({ status: 'error', message: 'Report not found.' });
    return res.json({ status: 'success', data: report });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch report.' });
  }
};

// ── GET /api/admin/reports ────────────────────────────────────────────────────
const adminListReports = async (req, res) => {
  try {
    const { status, type, priority } = req.query;
    const where = {};
    if (status)   where.status   = status;
    if (type)     where.type     = type;
    if (priority) where.priority = priority;

    const reports = await db.Report.findAll({
      where,
      include: [{ model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
      order: [['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: reports });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch reports.' });
  }
};

// ── GET /api/admin/reports/:id ────────────────────────────────────────────────
const adminGetReport = async (req, res) => {
  try {
    const report = await db.Report.findByPk(req.params.id, {
      include: [{ model: db.User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
    });
    if (!report) return res.status(404).json({ status: 'error', message: 'Report not found.' });
    if (report.status === 'open') await report.update({ status: 'in_review' });
    return res.json({ status: 'success', data: report });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch report.' });
  }
};

// ── POST /api/admin/reports/:id/reply ────────────────────────────────────────
const adminReplyReport = async (req, res) => {
  try {
    const { reply, status, priority } = req.body;
    if (!reply) return res.status(400).json({ status: 'error', message: 'Reply message required.' });

    const report = await db.Report.findByPk(req.params.id);
    if (!report) return res.status(404).json({ status: 'error', message: 'Report not found.' });

    await report.update({
      admin_reply: reply,
      replied_by:  req.user.id,
      replied_at:  new Date(),
      status:      status   || 'resolved',
      priority:    priority || report.priority,
    });

    // Notify user
    const user = await db.User.findByPk(report.user_id);
    if (user) {
      const notify = require('../utils/email/notifications');
      notify.onReportReplied && notify.onReportReplied(user, report, reply).catch(console.error);
    }

    return res.json({ status: 'success', message: 'Reply sent.', data: report });
  } catch (err) {
    console.error('[adminReplyReport]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to reply.' });
  }
};

// ── PUT /api/admin/reports/:id/status ────────────────────────────────────────
const adminUpdateStatus = async (req, res) => {
  try {
    const report = await db.Report.findByPk(req.params.id);
    if (!report) return res.status(404).json({ status: 'error', message: 'Report not found.' });
    await report.update({ status: req.body.status, priority: req.body.priority || report.priority });
    return res.json({ status: 'success', message: 'Status updated.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update.' });
  }
};

module.exports = { createReport, getMyReports, getReport, adminListReports, adminGetReport, adminReplyReport, adminUpdateStatus };
