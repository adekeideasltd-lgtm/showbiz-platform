'use strict';

const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db      = require('../models');
const { sendEmail } = require('../utils/email/mailer');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const TOKEN_EXPIRY  = 24 * 60 * 60 * 1000; // 24 hours

// ── Send verification email ───────────────────────────────────────────────────
const sendVerificationEmail = async (user) => {
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY);

  await user.update({
    email_verify_token:   token,
    email_verify_expires: expiresAt,
  });

  const verifyUrl = FRONTEND_URL + '/verify-email?token=' + token;

  await sendEmail({
    to:      user.email,
    subject: 'Verify your Showbiz email address',
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
              <p style="font-size:18px;font-weight:600;margin-bottom:16px;">Verify your email address</p>
              <p style="font-size:14px;color:#8884A0;line-height:1.7;margin-bottom:20px;">
                Hi ${user.first_name}, welcome to Showbiz! Please verify your email address to activate your account.
              </p>
              <div style="background:#1A1A26;border:1px solid #2E2E42;border-radius:8px;padding:16px;margin-bottom:24px;">
                <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;">
                  <span style="color:#8884A0;">Account</span>
                  <span style="font-weight:600;">${user.email}</span>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:13px;padding:6px 0;">
                  <span style="color:#8884A0;">Link expires in</span>
                  <span style="font-weight:600;color:#F5C842;">24 hours</span>
                </div>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${verifyUrl}"
                   style="display:inline-block;padding:14px 32px;background:#C9A84C;color:#0A0A0F;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:1px;">
                  Verify My Email
                </a>
              </div>
              <p style="font-size:12px;color:#5A5870;line-height:1.7;">
                If you didn't create an account, you can safely ignore this email.<br/><br/>
                Or copy this link:<br/>
                <a href="${verifyUrl}" style="color:#C9A84C;word-break:break-all;">${verifyUrl}</a>
              </p>
            </div>
            <div style="padding:20px 32px;text-align:center;border-top:1px solid #2E2E42;">
              <p style="font-size:12px;color:#8884A0;">Showbiz Platform · Nigeria's premier model booking marketplace</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  });

  console.log('[EmailVerify] Verification email sent to', user.email);
};

// ── GET /api/auth/verify-email?token=xxx ──────────────────────────────────────
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ status: 'error', message: 'Token is required.' });

    const user = await db.User.findOne({
      where: { email_verify_token: token },
    });

    if (!user) {
      return res.status(400).json({ status: 'error', message: 'Invalid verification link.' });
    }

    if (user.email_verified) {
      return res.json({ status: 'success', message: 'Email already verified. You can log in.' });
    }

    if (new Date() > user.email_verify_expires) {
      return res.status(400).json({ status: 'error', message: 'Verification link has expired. Please request a new one.' });
    }

    await user.update({
      email_verified:       true,
      email_verify_token:   null,
      email_verify_expires: null,
    });

    console.log('[EmailVerify] Email verified for', user.email);
    return res.json({ status: 'success', message: 'Email verified successfully! You can now log in.' });
  } catch (err) {
    console.error('[verifyEmail]', err.message);
    return res.status(500).json({ status: 'error', message: 'Verification failed.' });
  }
};

// ── POST /api/auth/resend-verification ────────────────────────────────────────
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ status: 'error', message: 'Email is required.' });

    const user = await db.User.findOne({ where: { email: email.toLowerCase() } });

    // Always return success to prevent enumeration
    if (!user || user.email_verified) {
      return res.json({ status: 'success', message: 'If your email exists and is unverified, a new link has been sent.' });
    }

    await sendVerificationEmail(user);
    return res.json({ status: 'success', message: 'Verification email resent. Please check your inbox.' });
  } catch (err) {
    console.error('[resendVerification]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to resend verification.' });
  }
};

module.exports = { sendVerificationEmail, verifyEmail, resendVerification };
