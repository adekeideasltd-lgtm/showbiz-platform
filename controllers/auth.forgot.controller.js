'use strict';

const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db      = require('../models');
const { sendEmail } = require('../utils/email/mailer');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const TOKEN_EXPIRY  = 60 * 60 * 1000; // 1 hour in ms

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ status: 'error', message: 'Email is required.' });

    // Always return success to prevent email enumeration
    const successResponse = res.json({ status: 'success', message: 'If an account exists with that email, a password reset link has been sent.' });

    const user = await db.User.findOne({ where: { email: email.toLowerCase(), is_active: true } });
    if (!user) return successResponse;

    // Invalidate any existing unused tokens for this user
    await db.PasswordReset.update(
      { used_at: new Date() },
      { where: { user_id: user.id, used_at: null } }
    );

    // Generate secure random token
    const rawToken   = crypto.randomBytes(32).toString('hex');
    const tokenHash  = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt  = new Date(Date.now() + TOKEN_EXPIRY);

    await db.PasswordReset.create({
      id:         uuidv4(),
      user_id:    user.id,
      token:      rawToken,
      token_hash: tokenHash,
      expires_at: expiresAt,
      ip_address: req.ip,
    });

    const resetUrl = FRONTEND_URL + '/reset-password?token=' + rawToken;

    await sendEmail({
      to:      user.email,
      subject: 'Reset Your Showbiz Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"/></head>
        <body style="font-family:'Segoe UI',Arial,sans-serif;background:#0A0A0F;color:#F0EEF8;margin:0;padding:0;">
          <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
            <div style="background:#12121A;border:1px solid #2E2E42;border-radius:12px;overflow:hidden;">
              <div style="background:linear-gradient(135deg,#12121A,#1A1A26);padding:32px;text-align:center;border-bottom:1px solid #2E2E42;">
                <h1 style="font-size:24px;color:#C9A84C;letter-spacing:2px;margin:0;">SHOWBIZ</h1>
                <p style="font-size:11px;color:#8884A0;letter-spacing:3px;text-transform:uppercase;margin-top:4px;">Model Booking Platform</p>
              </div>
              <div style="padding:32px;">
                <p style="font-size:18px;font-weight:600;margin-bottom:16px;">Password Reset Request</p>
                <p style="font-size:14px;color:#8884A0;line-height:1.7;margin-bottom:16px;">
                  Hi ${user.first_name}, we received a request to reset your password.
                  Click the button below to create a new password.
                </p>
                <div style="background:#1A1A26;border:1px solid #2E2E42;border-radius:8px;padding:20px;margin:20px 0;">
                  <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #2E2E42;font-size:13px;">
                    <span style="color:#8884A0;">Account</span>
                    <span style="font-weight:600;">${user.email}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px;">
                    <span style="color:#8884A0;">Link expires in</span>
                    <span style="font-weight:600;color:#F5C842;">1 hour</span>
                  </div>
                </div>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${resetUrl}"
                     style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#0A0A0F;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:1px;">
                    Reset My Password
                  </a>
                </div>
                <p style="font-size:12px;color:#5A5870;line-height:1.7;">
                  If you did not request a password reset, please ignore this email.
                  Your password will remain unchanged.<br/><br/>
                  Or copy and paste this link:<br/>
                  <a href="${resetUrl}" style="color:#C9A84C;word-break:break-all;">${resetUrl}</a>
                </p>
              </div>
              <div style="padding:24px 32px;text-align:center;border-top:1px solid #2E2E42;">
                <p style="font-size:12px;color:#8884A0;">Showbiz Platform · Nigeria's premier model booking marketplace</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log('[ForgotPassword] Reset link sent to', user.email);
    return successResponse;
  } catch (err) {
    console.error('[forgotPassword]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to process request.' });
  }
};

// ── POST /api/auth/reset-password-link ────────────────────────────────────────
const resetPasswordViaLink = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { token, password, confirm_password } = req.body;

    if (!token)    { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Reset token is required.' }); }
    if (!password) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'New password is required.' }); }
    if (password !== confirm_password) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Passwords do not match.' }); }
    if (password.length < 8) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Password must be at least 8 characters.' }); }

    // Find valid unused token — verify by hash, not raw token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRecord = await db.PasswordReset.findOne({
      where: { token_hash: tokenHash, used_at: null },
      include: [{ model: db.User, as: 'user' }],
      transaction: t,
    });

    if (!resetRecord) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'Invalid or expired reset link. Please request a new one.' });
    }

    if (new Date() > resetRecord.expires_at) {
      await resetRecord.update({ used_at: new Date() }, { transaction: t });
      await t.commit();
      return res.status(400).json({ status: 'error', message: 'This reset link has expired. Please request a new one.' });
    }

    const user = resetRecord.user;
    if (!user || !user.is_active) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'Account not found or inactive.' });
    }

    // Hash new password
    const password_hash = await bcrypt.hash(password, 12);

    // Update password and clear force reset flag
    await user.update({ password_hash, force_password_reset: false }, { transaction: t });

    // Mark token as used
    await resetRecord.update({ used_at: new Date() }, { transaction: t });

    // Invalidate all other tokens for this user
    await db.PasswordReset.update(
      { used_at: new Date() },
      { where: { user_id: user.id, used_at: null }, transaction: t }
    );

    await t.commit();

    // Send confirmation email
    try {
      const { sendEmail } = require('../utils/email/mailer');
      await sendEmail({
        to:      user.email,
        subject: 'Password Reset Successful',
        html:    '<p>Hi ' + user.first_name + ', your Showbiz password has been reset successfully. <a href="' + (process.env.FRONTEND_URL || 'http://localhost:3001') + '/login">Login here</a>.</p>',
      });
    } catch (_) {}

    console.log('[ResetPassword] Password reset for', user.email);
    return res.json({ status: 'success', message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    await t.rollback();
    console.error('[resetPasswordViaLink]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to reset password.' });
  }
};

// ── GET /api/auth/verify-reset-token?token=xxx ────────────────────────────────
const verifyResetToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ status: 'error', message: 'Token is required.' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetRecord = await db.PasswordReset.findOne({
      where: { token_hash: tokenHash, used_at: null },
      include: [{ model: db.User, as: 'user', attributes: ['id','first_name','email'] }],
    });

    if (!resetRecord || new Date() > resetRecord.expires_at) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired reset link.' });
    }

    return res.json({
      status: 'success',
      data: {
        valid:      true,
        email:      resetRecord.user.email,
        first_name: resetRecord.user.first_name,
        expires_at: resetRecord.expires_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Token verification failed.' });
  }
};

module.exports = { forgotPassword, resetPasswordViaLink, verifyResetToken };
