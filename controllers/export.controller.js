'use strict';
const { Parser } = require('json2csv');
const db = require('../models');
const { Op } = require('sequelize');

const parseDate = (d) => d ? new Date(d) : null;

// ── Helper: send CSV ──────────────────────────────────────────────────────────
const sendCSV = (res, data, fields, filename) => {
  try {
    const parser = new Parser({ fields });
    const csv    = parser.parse(data);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Export failed.' });
  }
};

// ── GET /api/admin/export/bookings ────────────────────────────────────────────
const exportBookings = async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const where = {};
    if (status) where.status = status;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to)   where.created_at[Op.lte] = new Date(to + 'T23:59:59');
    }

    const bookings = await db.Booking.findAll({
      where,
      include: [
        { model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user', attributes: ['first_name','last_name','email'] }] },
        { model: db.User, as: 'owner', attributes: ['first_name','last_name','email'] },
      ],
      order: [['created_at', 'DESC']],
    });

    const data = bookings.map(b => ({
      'Booking ID':    b.id,
      'Event Name':    b.event_name,
      'Status':        b.status,
      'Amount (₦)':    b.amount,
      'Commission (₦)':b.commission_amount || 0,
      'Payout (₦)':   (b.amount - (b.commission_amount || 0)),
      'Model':         b.model?.user ? b.model.user.first_name + ' ' + b.model.user.last_name : '-',
      'Model Email':   b.model?.user?.email || '-',
      'Owner':         b.owner ? b.owner.first_name + ' ' + b.owner.last_name : '-',
      'Owner Email':   b.owner?.email || '-',
      'Event Date':    b.event_date || '-',
      'Created':       new Date(b.created_at).toLocaleDateString(),
    }));

    sendCSV(res, data, Object.keys(data[0] || {}), `bookings_${Date.now()}.csv`);
  } catch (err) {
    console.error('[exportBookings]', err.message);
    return res.status(500).json({ status: 'error', message: 'Export failed.' });
  }
};

// ── GET /api/admin/export/payments ────────────────────────────────────────────
const exportPayments = async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const where = {};
    if (status) where.status = status;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to)   where.created_at[Op.lte] = new Date(to + 'T23:59:59');
    }

    const payments = await db.Payment.findAll({
      where,
      include: [
        { model: db.User, as: 'owner', attributes: ['first_name','last_name','email'] },
        { model: db.Booking, as: 'booking', attributes: ['event_name','event_date'] },
      ],
      order: [['created_at', 'DESC']],
    });

    const data = payments.map(p => ({
      'Payment ID':    p.id,
      'Reference':     p.reference,
      'Amount (₦)':    p.amount,
      'Commission (₦)':p.commission_amount || 0,
      'Payout (₦)':   p.payout_amount || 0,
      'Status':        p.status,
      'Channel':       p.channel || '-',
      'Owner':         p.owner ? p.owner.first_name + ' ' + p.owner.last_name : '-',
      'Owner Email':   p.owner?.email || '-',
      'Event':         p.booking?.event_name || '-',
      'Event Date':    p.booking?.event_date || '-',
      'Created':       new Date(p.created_at).toLocaleDateString(),
    }));

    sendCSV(res, data, Object.keys(data[0] || {}), `payments_${Date.now()}.csv`);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Export failed.' });
  }
};

// ── GET /api/admin/export/users ───────────────────────────────────────────────
const exportUsers = async (req, res) => {
  try {
    const { from, to, role } = req.query;
    const where = {};
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to)   where.created_at[Op.lte] = new Date(to + 'T23:59:59');
    }

    let users = await db.User.findAll({
      where,
      include: [{ model: db.Role, as: 'roles', through: { attributes: [] } }],
      order: [['created_at', 'DESC']],
    });

    if (role) users = users.filter(u => u.roles?.some(r => r.name === role));

    const data = users.map(u => ({
      'User ID':      u.id,
      'First Name':   u.first_name,
      'Last Name':    u.last_name,
      'Email':        u.email,
      'Roles':        u.roles?.map(r => r.name).join(', ') || '-',
      'KYC Verified': u.kyc_verified ? 'Yes' : 'No',
      'Email Verified': u.email_verified ? 'Yes' : 'No',
      'City':         u.city || '-',
      'Country':      u.country || '-',
      'Joined':       new Date(u.created_at).toLocaleDateString(),
    }));

    sendCSV(res, data, Object.keys(data[0] || {}), `users_${Date.now()}.csv`);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Export failed.' });
  }
};

// ── GET /api/admin/export/kyc ─────────────────────────────────────────────────
const exportKYC = async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = status;

    const kycs = await db.KYCVerification.findAll({
      where,
      include: [{ model: db.User, as: 'user', attributes: ['first_name','last_name','email'] }],
      order: [['created_at', 'DESC']],
    });

    const data = kycs.map(k => ({
      'KYC ID':        k.id,
      'Name':          k.user ? k.user.first_name + ' ' + k.user.last_name : '-',
      'Email':         k.user?.email || '-',
      'Role':          k.role,
      'Full Legal Name': k.full_legal_name || '-',
      'Phone':         k.phone_number || '-',
      'State':         k.state || '-',
      'NIN':           k.nin_number || '-',
      'Status':        k.status,
      'Submitted':     k.submitted_at ? new Date(k.submitted_at).toLocaleDateString() : '-',
      'Reviewed At':   k.reviewed_at  ? new Date(k.reviewed_at).toLocaleDateString()  : '-',
    }));

    sendCSV(res, data, Object.keys(data[0] || {}), `kyc_${Date.now()}.csv`);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Export failed.' });
  }
};

// ── GET /api/admin/export/contacts ────────────────────────────────────────────
const exportContacts = async (req, res) => {
  try {
    const contacts = await db.ContactSubmission.findAll({ order: [['created_at', 'DESC']] });
    const data = contacts.map(c => ({
      'ID':       c.id,
      'Name':     c.name,
      'Email':    c.email,
      'Subject':  c.subject,
      'Message':  c.message,
      'Status':   c.status,
      'IP':       c.ip_address || '-',
      'Date':     new Date(c.created_at).toLocaleDateString(),
    }));
    sendCSV(res, data, Object.keys(data[0] || {}), `contacts_${Date.now()}.csv`);
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Export failed.' });
  }
};

module.exports = { exportBookings, exportPayments, exportUsers, exportKYC, exportContacts };
