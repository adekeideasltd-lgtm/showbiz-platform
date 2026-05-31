'use strict';
const db     = require('../models');
const notify = require('../utils/email/notifications');

// ── POST /api/contact ─────────────────────────────────────────────────────────
const submitContact = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message)
      return res.status(400).json({ status: 'error', message: 'All fields required.' });

    // Save to DB
    const submission = await db.ContactSubmission.create({
      name, email, subject, message,
      ip_address: req.ip || req.headers['x-forwarded-for'],
    });

    // Send emails (non-blocking)
    notify.onContactForm({ name, email, subject, message }).catch(console.error);

    return res.json({ status: 'success', message: 'Message sent successfully.', data: { id: submission.id } });
  } catch (err) {
    console.error('[submitContact]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to send message.' });
  }
};

// ── GET /api/admin/contact ────────────────────────────────────────────────────
const listContacts = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;

    const submissions = await db.ContactSubmission.findAll({
      where,
      order: [['created_at', 'DESC']],
    });
    return res.json({ status: 'success', data: submissions });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch contacts.' });
  }
};

// ── GET /api/admin/contact/:id ────────────────────────────────────────────────
const getContact = async (req, res) => {
  try {
    const submission = await db.ContactSubmission.findByPk(req.params.id);
    if (!submission) return res.status(404).json({ status: 'error', message: 'Not found.' });
    // Mark as read
    if (submission.status === 'new') await submission.update({ status: 'read' });
    return res.json({ status: 'success', data: submission });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch contact.' });
  }
};

// ── PUT /api/admin/contact/:id ────────────────────────────────────────────────
const updateContact = async (req, res) => {
  try {
    const submission = await db.ContactSubmission.findByPk(req.params.id);
    if (!submission) return res.status(404).json({ status: 'error', message: 'Not found.' });
    await submission.update({
      status:     req.body?.status     || submission.status,
      admin_note: req.body?.admin_note || submission.admin_note,
    });
    return res.json({ status: 'success', message: 'Updated.', data: submission });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update.' });
  }
};

// ── DELETE /api/admin/contact/:id ─────────────────────────────────────────────
const deleteContact = async (req, res) => {
  try {
    const submission = await db.ContactSubmission.findByPk(req.params.id);
    if (!submission) return res.status(404).json({ status: 'error', message: 'Not found.' });
    await submission.destroy();
    return res.json({ status: 'success', message: 'Deleted.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to delete.' });
  }
};

module.exports = { submitContact, listContacts, getContact, updateContact, deleteContact };
