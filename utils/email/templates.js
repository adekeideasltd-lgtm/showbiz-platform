'use strict';

const BASE_URL = process.env.FRONTEND_URL || 'https://twerkie.com';
const PLATFORM = 'Twerkie';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@twerkie.com';

const formatNaira = (n) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

const safe = (val, fallback = 'there') => (val && val !== 'undefined') ? val : fallback;

// ── Base layout ───────────────────────────────────────────────────────────────
const base = (content, previewText = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${PLATFORM}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f5f5f5; color: #1a1a1a; }
    .wrapper { max-width: 580px; margin: 0 auto; padding: 40px 16px; }
    .card { background: #ffffff; border-radius: 8px; overflow: hidden; }
    .header { padding: 36px 40px 28px; text-align: center; border-bottom: 1px solid #eeeeee; }
    .logo { font-size: 26px; font-weight: 800; color: #1a1a1a; letter-spacing: 3px; }
    .logo span { color: #C9A84C; }
    .tagline { font-size: 11px; color: #999999; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 12px; }
    .text { font-size: 14px; color: #555555; line-height: 1.8; margin-bottom: 14px; }
    .info-box { background: #f9f9f9; border-radius: 6px; padding: 20px 24px; margin: 24px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #eeeeee; font-size: 13px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #999999; }
    .info-value { font-weight: 600; color: #1a1a1a; text-align: right; max-width: 60%; }
    .btn { display: inline-block; padding: 13px 32px; background: #1a1a1a; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; margin: 8px 0; }
    .amount { font-size: 32px; font-weight: 800; color: #1a1a1a; text-align: center; padding: 20px 0; }
    .amount-label { font-size: 12px; color: #999999; text-align: center; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .divider { height: 1px; background: #eeeeee; margin: 28px 0; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-success { background: #e8f8f0; color: #1a9e5c; }
    .badge-warning { background: #fef9ec; color: #b58700; }
    .badge-danger  { background: #fdf0f0; color: #c0392b; }
    .highlight { background: #fafafa; border-left: 3px solid #C9A84C; padding: 14px 18px; margin: 20px 0; border-radius: 0 6px 6px 0; font-size: 14px; color: #333333; line-height: 1.7; }
    .footer { padding: 24px 40px; text-align: center; border-top: 1px solid #eeeeee; }
    .footer p { font-size: 12px; color: #aaaaaa; line-height: 2; }
    .footer a { color: #1a1a1a; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>` : ''}
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <div class="logo">TWER<span>KIE</span></div>
        <div class="tagline">Entertainment Booking Platform</div>
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        <p>
          © ${new Date().getFullYear()} ${PLATFORM} · Nigeria's Premier Entertainment Booking Platform<br/>
          <a href="${BASE_URL}">twerkie.com</a> &nbsp;·&nbsp;
          <a href="mailto:${SUPPORT_EMAIL}">Contact Support</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

// ── Templates ─────────────────────────────────────────────────────────────────

const welcomeModel = ({ firstName }) => ({
  subject: `Welcome to Twerkie, ${safe(firstName)}!`,
  html: base(`
    <p class="greeting">Welcome, ${safe(firstName)}!</p>
    <p class="text">You've successfully joined Twerkie as an entertainer. We're excited to have you on board.</p>
    <p class="text">To start receiving booking requests, please complete your profile and submit your KYC verification.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/model/profile" class="btn">Complete Your Profile</a>
    </div>
    <p class="text">Once your profile is approved, show owners will be able to discover and book you for their events.</p>
  `, `Welcome to Twerkie, ${safe(firstName)}!`),
});

const welcomeOwner = ({ firstName }) => ({
  subject: `Welcome to Twerkie, ${safe(firstName)}!`,
  html: base(`
    <p class="greeting">Welcome, ${safe(firstName)}!</p>
    <p class="text">You've successfully joined Twerkie as a show owner. You can now browse and book verified entertainers for your events.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/owner/models" class="btn">Browse Entertainers</a>
    </div>
    <p class="text">All entertainers on our platform are KYC verified, and your payments are held securely in escrow until event completion.</p>
  `, `Welcome to Twerkie!`),
});

const modelApproved = ({ firstName }) => ({
  subject: 'Your Twerkie profile has been approved',
  html: base(`
    <p class="greeting">Great news, ${safe(firstName)}!</p>
    <p class="text">Your entertainer profile has been reviewed and approved. You are now visible to show owners on Twerkie.</p>
    <div class="highlight">
      Booking requests will appear in your dashboard. Make sure your availability is up to date so owners can book you.
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/model/bookings" class="btn">View Your Dashboard</a>
    </div>
  `, 'Your profile is approved!'),
});

const modelRejected = ({ firstName, reason }) => ({
  subject: 'Update on your Twerkie profile submission',
  html: base(`
    <p class="greeting">Hi ${safe(firstName)},</p>
    <p class="text">Thank you for submitting your entertainer profile. After review, we were unable to approve it at this time.</p>
    ${reason ? `<div class="highlight"><strong>Reason:</strong> ${reason}</div>` : ''}
    <p class="text">Please make the necessary updates and resubmit. If you have any questions, contact our support team.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/model/profile" class="btn">Update Profile</a>
    </div>
  `, 'Update on your profile submission'),
});

const passwordChanged = ({ firstName }) => ({
  subject: 'Your Twerkie password has been changed',
  html: base(`
    <p class="greeting">Hi ${safe(firstName)},</p>
    <p class="text">Your Twerkie account password was successfully changed.</p>
    <p class="text">If you did not make this change, please contact our support team immediately.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="mailto:${SUPPORT_EMAIL}" class="btn">Contact Support</a>
    </div>
  `, 'Your password has been changed'),
});

const bookingSubmitted = ({ ownerName, booking }) => ({
  subject: `Booking submitted — ${booking?.event_title || 'Your event'}`,
  html: base(`
    <p class="greeting">Hi ${safe(ownerName)},</p>
    <p class="text">Your booking request has been submitted and is currently under review by our team.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking?.event_title || '-'}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-value">${formatDate(booking?.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Location</span><span class="info-value">${booking?.event_location || '-'}</span></div>
      <div class="info-row"><span class="info-label">Total Amount</span><span class="info-value">${formatNaira(booking?.total_amount)}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-warning">Pending Review</span></span></div>
    </div>
    <p class="text">You will be notified once the booking has been reviewed and approved.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/owner/bookings" class="btn">View Booking</a>
    </div>
  `, `Booking submitted for ${booking?.event_title || 'your event'}`),
});

const adminNewBooking = ({ booking, ownerName, modelName }) => ({
  subject: `New booking request — ${booking?.event_title || 'Event'}`,
  html: base(`
    <p class="greeting">New Booking Request</p>
    <p class="text">A new booking has been submitted and requires your review.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking?.event_title || '-'}</span></div>
      <div class="info-row"><span class="info-label">Show Owner</span><span class="info-value">${safe(ownerName, 'Unknown')}</span></div>
      <div class="info-row"><span class="info-label">Entertainer</span><span class="info-value">${safe(modelName, 'Unknown')}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-value">${formatDate(booking?.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Amount</span><span class="info-value">${formatNaira(booking?.total_amount)}</span></div>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/admin/bookings" class="btn">Review Booking</a>
    </div>
  `, 'New booking requires review'),
});

const bookingForModel = ({ modelName, booking, ownerName }) => ({
  subject: `New booking request — ${booking?.event_title || 'Event'}`,
  html: base(`
    <p class="greeting">Hi ${safe(modelName)},</p>
    <p class="text">You have a new booking request from ${safe(ownerName, 'a show owner')}. Please review and respond.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking?.event_title || '-'}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-value">${formatDate(booking?.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Location</span><span class="info-value">${booking?.event_location || '-'}</span></div>
      <div class="info-row"><span class="info-label">Duration</span><span class="info-value">${booking?.duration_hours || '-'} hour(s)</span></div>
      <div class="info-row"><span class="info-label">Your Earnings</span><span class="info-value">${formatNaira(booking?.total_amount * 0.8)}</span></div>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/model/bookings" class="btn">Accept or Decline</a>
    </div>
    <p class="text" style="font-size:12px;color:#aaaaaa;">Please respond promptly. Unresponded requests may be reassigned.</p>
  `, `New booking request for ${booking?.event_title || 'an event'}`),
});

const bookingConfirmed = ({ ownerName, modelName, booking }) => ({
  subject: `Booking confirmed — ${booking?.event_title || 'Your event'}`,
  html: base(`
    <p class="greeting">Hi ${safe(ownerName)},</p>
    <p class="text">${safe(modelName, 'Your entertainer')} has accepted your booking request. Please proceed with payment to confirm the event.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking?.event_title || '-'}</span></div>
      <div class="info-row"><span class="info-label">Entertainer</span><span class="info-value">${safe(modelName, '-')}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-value">${formatDate(booking?.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Amount Due</span><span class="info-value">${formatNaira(booking?.total_amount)}</span></div>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/owner/bookings" class="btn">Proceed to Payment</a>
    </div>
    <p class="text" style="font-size:12px;color:#aaaaaa;">Payment is held securely in escrow and only released to the entertainer after the event is completed.</p>
  `, `${safe(modelName, 'Your entertainer')} accepted your booking`),
});

const bookingDeclined = ({ ownerName, modelName, booking, reason }) => ({
  subject: `Booking update — ${booking?.event_title || 'Your event'}`,
  html: base(`
    <p class="greeting">Hi ${safe(ownerName)},</p>
    <p class="text">Unfortunately, ${safe(modelName, 'the entertainer')} was unable to accept your booking request.</p>
    ${reason ? `<div class="highlight"><strong>Reason:</strong> ${reason}</div>` : ''}
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking?.event_title || '-'}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-value">${formatDate(booking?.event_date)}</span></div>
    </div>
    <p class="text">You can browse other available entertainers and submit a new booking.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/owner/models" class="btn">Browse Entertainers</a>
    </div>
  `, 'Booking update'),
});

const paymentSuccess = ({ ownerName, payment, booking }) => ({
  subject: `Payment confirmed — ${booking?.event_title || 'Your event'}`,
  html: base(`
    <p class="greeting">Hi ${safe(ownerName)},</p>
    <p class="text">Your payment has been received and is held securely in escrow until the event is completed.</p>
    <div class="amount-label">Amount Paid</div>
    <div class="amount">${formatNaira(payment?.amount)}</div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking?.event_title || '-'}</span></div>
      <div class="info-row"><span class="info-label">Event Date</span><span class="info-value">${formatDate(booking?.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Reference</span><span class="info-value">${payment?.provider_reference || '-'}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-success">Confirmed</span></span></div>
    </div>
    <p class="text" style="font-size:12px;color:#aaaaaa;">Funds will be released to the entertainer only after you confirm the event was completed successfully.</p>
  `, 'Payment confirmed'),
});

const payoutProcessed = ({ modelName, payout }) => ({
  subject: 'Your earnings have been processed',
  html: base(`
    <p class="greeting">Hi ${safe(modelName)},</p>
    <p class="text">Great news! Your earnings from a completed booking have been processed.</p>
    <div class="amount-label">Amount Credited</div>
    <div class="amount">${formatNaira(payout?.amount)}</div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Bank</span><span class="info-value">${payout?.bank_name || '-'}</span></div>
      <div class="info-row"><span class="info-label">Account</span><span class="info-value">${payout?.account_number || '-'}</span></div>
      <div class="info-row"><span class="info-label">Reference</span><span class="info-value">${payout?.reference || '-'}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-success">Processed</span></span></div>
    </div>
    <p class="text">Thank you for delivering a great performance. Keep up the excellent work!</p>
  `, 'Your earnings have been processed'),
});

const walletCredited = ({ firstName, amount, description }) => ({
  subject: 'Your Twerkie wallet has been credited',
  html: base(`
    <p class="greeting">Hi ${safe(firstName)},</p>
    <p class="text">Your Twerkie wallet has been credited.</p>
    <div class="amount-label">Amount Credited</div>
    <div class="amount">${formatNaira(amount)}</div>
    ${description ? `<div class="highlight">${description}</div>` : ''}
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/owner/wallet" class="btn">View Wallet</a>
    </div>
  `, 'Your wallet has been credited'),
});

const passwordReset = ({ firstName, resetUrl }) => ({
  subject: 'Reset your Twerkie password',
  html: base(`
    <p class="greeting">Hi ${safe(firstName)},</p>
    <p class="text">We received a request to reset your Twerkie password. Click the button below to set a new password.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </div>
    <p class="text" style="font-size:12px;color:#aaaaaa;">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
  `, 'Reset your password'),
});

const twoFACode = ({ firstName, code }) => ({
  subject: `Your Twerkie verification code: ${code}`,
  html: base(`
    <p class="greeting">Hi ${safe(firstName)},</p>
    <p class="text">Your two-factor authentication code is:</p>
    <div style="text-align:center;margin:32px 0;">
      <div style="display:inline-block;font-size:36px;font-weight:800;letter-spacing:10px;color:#1a1a1a;background:#f5f5f5;padding:20px 40px;border-radius:8px;">${code}</div>
    </div>
    <p class="text" style="font-size:12px;color:#aaaaaa;text-align:center;">This code expires in 5 minutes. Do not share it with anyone.</p>
  `, `Your verification code: ${code}`),
});

const bookingApprovedByAdmin = ({ firstName, booking }) => ({
  subject: `Booking approved — ${booking?.event_title || 'Your event'}`,
  html: base(`
    <p class="greeting">Hi ${safe(firstName)},</p>
    <p class="text">Your booking has been reviewed and approved by our team. The entertainer will now review and respond to your request.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking?.event_title || '-'}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-value">${formatDate(booking?.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-success">Approved</span></span></div>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${BASE_URL}/owner/bookings" class="btn">View Booking</a>
    </div>
  `, 'Your booking has been approved'),
});

module.exports = {
  base,
  welcomeModel, welcomeOwner,
  modelApproved, modelRejected,
  passwordChanged, passwordReset,
  bookingSubmitted, adminNewBooking, bookingForModel,
  bookingConfirmed, bookingDeclined,
  paymentSuccess, payoutProcessed,
  walletCredited, twoFACode,
  bookingApprovedByAdmin,
};
