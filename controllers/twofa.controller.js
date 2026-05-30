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
    const { token, backup_code, user_id } = req.body;
    if (!user_id) return res.status(400).json({ status: 'error', message: 'User ID required.' });

    const user = await db.User.findByPk(user_id);
    if (!user?.two_fa_enabled) return res.status(400).json({ status: 'error', message: '2FA not enabled.' });

    // Check backup code
    if (backup_code) {
      const codes = user.two_fa_backup_codes || [];
      const idx   = codes.indexOf(backup_code.toUpperCase());
      if (idx === -1) return res.status(400).json({ status: 'error', message: 'Invalid backup code.' });
      // Remove used backup code
      codes.splice(idx, 1);
      await user.update({ two_fa_backup_codes: codes });
      return res.json({ status: 'success', message: '2FA verified via backup code.' });
    }

    if (!token) return res.status(400).json({ status: 'error', message: 'Token required.' });

    const verified = speakeasy.totp.verify({
      secret:   user.two_fa_secret,
      encoding: 'base32',
      token,
      window:   2,
    });

    if (!verified) return res.status(400).json({ status: 'error', message: 'Invalid token.' });

    return res.json({ status: 'success', message: '2FA verified.' });
  } catch (err) {
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
