const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const db        = require('../models');
const crypto    = require('crypto');

// ── GET /api/auth/2fa/setup — generate secret and QR code ─────────────────────
const setup2FA = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    if (user.two_fa_enabled) return res.status(400).json({ status: 'error', message: '2FA is already enabled.' });

    const secret = speakeasy.generateSecret({
      name:   `Showbiz (${user.email})`,
      issuer: 'Showbiz Platform',
      length: 20,
    });

    // Temporarily store secret (not yet enabled)
    await user.update({ two_fa_secret: secret.base32 });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return res.json({
      status: 'success',
      data: {
        secret:    secret.base32,
        qr_code:   qrCodeUrl,
        otpauth:   secret.otpauth_url,
      },
    });
  } catch (err) {
    console.error('[setup2FA]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to setup 2FA.' });
  }
};

// ── POST /api/auth/2fa/enable — verify token and enable 2FA ───────────────────
const enable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ status: 'error', message: 'Token required.' });

    const user = await db.User.findByPk(req.user.id);
    if (!user?.two_fa_secret) return res.status(400).json({ status: 'error', message: 'Run setup first.' });

    const verified = speakeasy.totp.verify({
      secret:   user.two_fa_secret,
      encoding: 'base32',
      token,
      window:   2,
    });

    if (!verified) return res.status(400).json({ status: 'error', message: 'Invalid token. Try again.' });

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());

    await user.update({ two_fa_enabled: true, two_fa_backup_codes: backupCodes });

    return res.json({
      status: 'success',
      message: '2FA enabled successfully.',
      data: { backup_codes: backupCodes },
    });
  } catch (err) {
    console.error('[enable2FA]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to enable 2FA.' });
  }
};

// ── POST /api/auth/2fa/disable — disable 2FA ──────────────────────────────────
const disable2FA = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ status: 'error', message: 'Token required.' });

    const user = await db.User.findByPk(req.user.id);
    if (!user?.two_fa_enabled) return res.status(400).json({ status: 'error', message: '2FA is not enabled.' });

    const verified = speakeasy.totp.verify({
      secret:   user.two_fa_secret,
      encoding: 'base32',
      token,
      window:   2,
    });

    if (!verified) return res.status(400).json({ status: 'error', message: 'Invalid token.' });

    await user.update({ two_fa_enabled: false, two_fa_secret: null, two_fa_backup_codes: null });

    return res.json({ status: 'success', message: '2FA disabled.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to disable 2FA.' });
  }
};

// ── POST /api/auth/2fa/verify — verify token during login ─────────────────────
const verify2FA = async (req, res) => {
  try {
    const { token, backup_code, temp_token } = req.body;
    if (!temp_token) return res.status(400).json({ status: 'error', message: 'Temporary token required.' });

    // Verify temp token
    let decoded;
    try {
      const jwt = require('jsonwebtoken');
      decoded = jwt.verify(temp_token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ status: 'error', message: 'Verification session expired. Please log in again.' });
    }
    if (!decoded.pending_2fa) return res.status(401).json({ status: 'error', message: 'Invalid verification session.' });

    const user = await db.User.findByPk(decoded.userId, {
      include: [{ model: db.Role, as: 'roles', through: { attributes: [] },
        include: [{ model: db.Permission, as: 'permissions', through: { attributes: [] } }] }],
    });
    if (!user?.two_fa_enabled) return res.status(400).json({ status: 'error', message: '2FA not enabled.' });

    // Check lockout
    if (user.otp_locked_until && new Date() < new Date(user.otp_locked_until)) {
      const remaining = Math.ceil((new Date(user.otp_locked_until) - new Date()) / 60000);
      return res.status(429).json({ status: 'error', code: 'ACCOUNT_LOCKED', message: `Too many failed attempts. Try again in ${remaining} minute(s).` });
    }

    const MAX_ATTEMPTS = 5;
    const LOCKOUT_MINUTES = 15;

    // Check backup code
    if (backup_code) {
      const codes = user.two_fa_backup_codes || [];
      const idx   = codes.indexOf(backup_code.toUpperCase());
      if (idx === -1) {
        const attempts = (user.otp_attempt_count || 0) + 1;
        const locked = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null;
        await user.update({ otp_attempt_count: attempts, otp_locked_until: locked });
        return res.status(400).json({ status: 'error', message: `Invalid backup code. ${MAX_ATTEMPTS - attempts} attempts remaining.` });
      }
      codes.splice(idx, 1);
      await user.update({ two_fa_backup_codes: codes, otp_attempt_count: 0, otp_locked_until: null });
    } else {
      if (!token) return res.status(400).json({ status: 'error', message: 'Token required.' });
      const verified = speakeasy.totp.verify({
        secret: user.two_fa_secret, encoding: 'base32', token, window: 2,
      });
      if (!verified) {
        const attempts = (user.otp_attempt_count || 0) + 1;
        const locked = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null;
        await user.update({ otp_attempt_count: attempts, otp_locked_until: locked });
        return res.status(400).json({ status: 'error', message: `Invalid code. ${MAX_ATTEMPTS - attempts} attempt(s) remaining.` });
      }
      await user.update({ otp_attempt_count: 0, otp_locked_until: null });
    }

    // Issue full JWT
    const jwt = require('jsonwebtoken');
    const roleNames = user.roles.map(r => r.name);
    const permissions = new Set();
    for (const role of user.roles) {
      if (role.name === 'super_admin') { permissions.add('*'); break; }
      for (const perm of role.permissions) permissions.add(perm.name);
    }
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, roles: roleNames },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
    );
    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );
    await user.update({ last_login_at: new Date(), last_login_ip: null });

    return res.json({
      status: 'success',
      message: '2FA verified successfully.',
      data: {
        accessToken, refreshToken,
        user: {
          id: user.id, email: user.email,
          firstName: user.first_name, lastName: user.last_name,
          roles: roleNames, permissions: [...permissions],
          isSuperAdmin: roleNames.includes('super_admin'),
        },
      },
    });
  } catch (err) {
    console.error('[verify2FA]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to verify 2FA.' });
  }
};

// ── GET /api/auth/2fa/status — get 2FA status ─────────────────────────────────
const get2FAStatus = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.id, {
      attributes: ['id', 'two_fa_enabled', 'two_fa_backup_codes'],
    });
    return res.json({
      status: 'success',
      data: {
        enabled:      user.two_fa_enabled,
        backup_codes: user.two_fa_enabled ? (user.two_fa_backup_codes?.length || 0) : 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

module.exports = { setup2FA, enable2FA, disable2FA, verify2FA, get2FAStatus };
