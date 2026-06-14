'use strict';

const notify = require('../utils/email/notifications');

const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../models');

const JWT_SECRET          = process.env.JWT_SECRET;
const JWT_EXPIRES_IN      = process.env.JWT_EXPIRES_IN      || '15m';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
    }

    const user = await db.User.findOne({
      where: { email, is_active: true },
      include: [{
        model: db.Role, as: 'roles',
        through: { attributes: [] },
        include: [{ model: db.Permission, as: 'permissions', through: { attributes: [] } }],
      }],
    });

    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
    }
    if (user.is_suspended) {
      return res.status(403).json({ status: 'error', message: 'Account suspended. Contact admin.' });
    }
    if (user.account_status === 'deleted') {
      return res.status(403).json({ status: 'error', message: 'This account has been permanently deleted.' });
    }
    if (user.account_status === 'pending_deletion') {
      return res.status(403).json({ status: 'error', message: 'This account is scheduled for deletion. Contact support to cancel.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      try {
        const { createAuditLog } = require('../utils/audit');
        await createAuditLog({ actorId: user.id, actorRole: 'unknown', action: 'user.login_failed',
          entityType: 'User', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'],
          newValue: { reason: 'invalid_password' } });
      } catch {}
      return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
    }

    // ── 2FA Check ────────────────────────────────────────────────────────
    if (user.two_fa_enabled) {
      // Check if account is locked
      if (user.otp_locked_until && new Date() < new Date(user.otp_locked_until)) {
        const remaining = Math.ceil((new Date(user.otp_locked_until) - new Date()) / 60000);
        return res.status(429).json({ status: 'error', code: 'ACCOUNT_LOCKED', message: `Too many failed attempts. Try again in ${remaining} minute(s).` });
      }
      // Issue temporary token for 2FA verification
      const tempToken = jwt.sign(
        { userId: user.id, pending_2fa: true },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        status: 'success',
        data: {
          requires_2fa: true,
          temp_token:   tempToken,
          user_id:      user.id,
        },
      });
    }

    const roleNames = user.roles.map(r => r.name);
    const permissions = new Set();
    for (const role of user.roles) {
      if (role.name === 'super_admin') { permissions.add('*'); break; }
      for (const perm of role.permissions) permissions.add(perm.name);
    }

    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, roles: roleNames },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES }
    );

    // Auto-reactivate deactivated accounts on login
    const { autoReactivate } = require('./account.controller');
    await autoReactivate(user.id);

    // Update last login
    await user.update({ last_login_at: new Date(), last_login_ip: req.ip });
    try {
      const { createAuditLog } = require('../utils/audit');
      await createAuditLog({ actorId: user.id, actorRole: roleNames[0] || 'user', action: 'user.login',
        entityType: 'User', entityId: user.id, ipAddress: req.ip, userAgent: req.headers['user-agent'],
        newValue: { roles: roleNames } });
    } catch {}

    return res.json({
      status: 'success',
      message: user.force_password_reset ? 'Login successful. Please change your password.' : 'Login successful.',
      data: {
        accessToken,
        refreshToken,
        forcePasswordReset: user.force_password_reset,
        user: {
          id:        user.id,
          email:     user.email,
          firstName: user.first_name,
          lastName:  user.last_name,
          roles:     roleNames,
          permissions: [...permissions],
          isSuperAdmin: roleNames.includes('super_admin'),
        },
      },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ status: 'error', message: 'Login failed.' });
  }
};

// POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ status: 'error', message: 'Refresh token required.' });

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ status: 'error', message: 'Invalid or expired refresh token.' });
    }

    const user = await db.User.findOne({ where: { id: decoded.userId, is_active: true, is_suspended: false } });
    if (!user) return res.status(401).json({ status: 'error', message: 'User not found.' });

    const accessToken = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({ status: 'success', data: { accessToken } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Token refresh failed.' });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  // With stateless JWT, logout is handled client-side by deleting the token.
  // If you add a token blacklist later, revoke it here.
  return res.json({ status: 'success', message: 'Logged out successfully.' });
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ status: 'error', message: 'currentPassword and newPassword are required.' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ status: 'error', message: 'New password must be at least 8 characters.' });
    }

    const user = await db.User.findByPk(req.user.id);
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ status: 'error', message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 12);
    await user.update({ password_hash: hash, force_password_reset: false });
    notify.onPasswordChanged(user).catch(console.error);

    return res.json({ status: 'success', message: 'Password changed successfully.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Password reset failed.' });
  }
};

// ── POST /api/auth/change-password ───────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password)
      return res.status(400).json({ status: 'error', message: 'Both fields required.' });
    if (new_password.length < 8)
      return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters.' });

    const user = await db.User.findByPk(req.user.id);
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid)
      return res.status(401).json({ status: 'error', message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(new_password, 12);
    await user.update({ password_hash: hash });

    return res.json({ status: 'success', message: 'Password changed successfully.' });
  } catch (err) {
    console.error('[changePassword]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to change password.' });
  }
};

module.exports = { login, changePassword, refresh, logout, resetPassword };
