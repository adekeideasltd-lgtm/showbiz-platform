'use strict';

const notify = require('../utils/email/notifications');

const bcrypt         = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db             = require('../models');

// Allowed registration roles (admin/super_admin cannot self-register)
const ALLOWED_ROLES = ['model', 'showbiz_owner'];

// ── POST /api/auth/register ───────────────────────────────────────────────────
const register = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      first_name, last_name, email, password, confirm_password,
      role, phone, country, state, city,
    } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────
    const errors = [];

    if (!first_name || first_name.trim().length < 2)
      errors.push('First name must be at least 2 characters.');

    if (!last_name || last_name.trim().length < 2)
      errors.push('Last name must be at least 2 characters.');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push('A valid email address is required.');

    if (!password || password.length < 8)
      errors.push('Password must be at least 8 characters.');

    if (password !== confirm_password)
      errors.push('Passwords do not match.');

    if (!role || !ALLOWED_ROLES.includes(role))
      errors.push(`Role must be one of: ${ALLOWED_ROLES.join(', ')}.`);

    if (errors.length > 0) {
      await t.rollback();
      return res.status(400).json({ status: 'error', errors });
    }

    // ── Check duplicate email ───────────────────────────────────────────────
    const existing = await db.User.findOne({ where: { email: email.toLowerCase() } });
    if (existing) {
      await t.rollback();
      return res.status(409).json({ status: 'error', message: 'An account with this email already exists.' });
    }

    // ── Find the role ───────────────────────────────────────────────────────
    const roleRecord = await db.Role.findOne({ where: { name: role, is_active: true } });
    if (!roleRecord) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'Invalid role selected.' });
    }

    // ── Hash password ───────────────────────────────────────────────────────
    const password_hash = await bcrypt.hash(password, 12);

    // ── Create user ─────────────────────────────────────────────────────────
    const user = await db.User.create({
      id:                   uuidv4(),
      first_name:           first_name.trim(),
      last_name:            last_name.trim(),
      email:                email.toLowerCase().trim(),
      password_hash,
      is_active:            true,
      is_suspended:         false,
      force_password_reset: false,
    }, { transaction: t });

    // ── Assign role ─────────────────────────────────────────────────────────
    await db.UserRole.create({
      id:          uuidv4(),
      user_id:     user.id,
      role_id:     roleRecord.id,
      assigned_by: user.id,
    }, { transaction: t });

    // ── Create profile based on role ────────────────────────────────────────
    if (role === 'model') {
      await db.ModelProfile.create({
        id:      uuidv4(),
        user_id: user.id,
        status:  'pending',
        country: country || null,
        state:   state   || null,
        city:    city    || null,
        phone:   phone   || null,
      }, { transaction: t });
    }

    if (role === 'showbiz_owner') {
      await db.ShowbizProfile.create({
        id:      uuidv4(),
        user_id: user.id,
        country: country || null,
        state:   state   || null,
        city:    city    || null,
        phone:   phone   || null,
      }, { transaction: t });
    }

    await t.commit();
    try {
      if (role === 'model')         notify.onModelRegistered(user).catch(console.error);
      if (role === 'showbiz_owner') notify.onOwnerRegistered(user).catch(console.error);
    } catch (_) {}
    return res.status(201).json({
      status: 'success',
      message: role === 'model'
        ? 'Registration successful. Your profile is pending admin approval.'
        : 'Registration successful. You can now log in.',
      data: {
        id:         user.id,
        first_name: user.first_name,
        last_name:  user.last_name,
        email:      user.email,
        role,
      },
    });

  } catch (err) {
    await t.rollback();
    console.error('[register]', err.message);
    return res.status(500).json({ status: 'error', message: 'Registration failed. Please try again.' });
  }
};

// ── GET /api/auth/check-email?email=xxx ───────────────────────────────────────
const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ status: 'error', message: 'Email is required.' });

    const exists = await db.User.findOne({ where: { email: email.toLowerCase() } });
    return res.json({ status: 'success', data: { available: !exists } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Check failed.' });
  }
};

module.exports = { register, checkEmail };
