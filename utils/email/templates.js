'use strict';

const BASE_URL    = process.env.FRONTEND_URL || 'http://localhost:3001';
const PLATFORM    = 'Showbiz Platform';
const GOLD        = '#C9A84C';
const DARK        = '#0A0A0F';
const DARK2       = '#12121A';
const BORDER      = '#2E2E42';
const TEXT        = '#F0EEF8';
const TEXT_MUTED  = '#8884A0';
const GREEN       = '#2ECC8A';
const RED         = '#E85C5C';
const BLUE        = '#5B8DEF';

const formatNaira = (n) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

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
    body { font-family: 'Segoe UI', Arial, sans-serif; background: ${DARK}; color: ${TEXT}; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: ${DARK2}; border: 1px solid ${BORDER}; border-radius: 12px; overflow: hidden; }
    .header { background: linear-gradient(135deg, ${DARK2}, #1A1A26); padding: 32px; text-align: center; border-bottom: 1px solid ${BORDER}; }
    .header h1 { font-size: 24px; color: ${GOLD}; letter-spacing: 2px; font-weight: 700; }
    .header p  { font-size: 12px; color: ${TEXT_MUTED}; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px; }
    .body  { padding: 32px; }
    .greeting { font-size: 18px; font-weight: 600; margin-bottom: 16px; }
    .text  { font-size: 14px; color: ${TEXT_MUTED}; line-height: 1.7; margin-bottom: 16px; }
    .info-box { background: #1A1A26; border: 1px solid ${BORDER}; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid ${BORDER}; font-size: 13px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: ${TEXT_MUTED}; }
    .info-value { font-weight: 600; color: ${TEXT}; }
    .btn { display: inline-block; padding: 14px 32px; background: ${GOLD}; color: ${DARK}; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 1px; margin: 20px 0; }
    .btn-outline { background: transparent; color: ${GOLD}; border: 2px solid ${GOLD}; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .badge-green  { background: rgba(46,204,138,0.15);  color: ${GREEN}; }
    .badge-red    { background: rgba(232,92,92,0.15);   color: ${RED}; }
    .badge-gold   { background: rgba(201,168,76,0.15);  color: ${GOLD}; }
    .badge-blue   { background: rgba(91,141,239,0.15);  color: ${BLUE}; }
    .divider { height: 1px; background: ${BORDER}; margin: 24px 0; }
    .footer { padding: 24px 32px; text-align: center; border-top: 1px solid ${BORDER}; }
    .footer p { font-size: 12px; color: ${TEXT_MUTED}; line-height: 1.8; }
    .footer a { color: ${GOLD}; text-decoration: none; }
    .amount { font-size: 28px; font-weight: 700; color: ${GOLD}; text-align: center; padding: 16px 0; }
  </style>
</head>
<body>
  ${previewText ? '<div style="display:none;max-height:0;overflow:hidden;">' + previewText + '</div>' : ''}
  <div class="wrapper">
    <div class="card">
      <div class="header">
        <h1>SHOWBIZ</h1>
        <p>Model Booking Platform</p>
      </div>
      <div class="body">
        ${content}
      </div>
      <div class="footer">
        <p>
          This email was sent by <strong>${PLATFORM}</strong><br/>
          Nigeria's premier model booking marketplace<br/>
          <a href="${BASE_URL}">Visit Platform</a> &nbsp;·&nbsp;
          <a href="${BASE_URL}/login">Login</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;

// ── 1. Welcome — Model ────────────────────────────────────────────────────────
const welcomeModel = ({ firstName }) => ({
  subject: 'Welcome to Showbiz — Your Profile is Under Review',
  html: base(`
    <p class="greeting">Welcome, ${firstName}! 🌟</p>
    <p class="text">Thank you for registering as a model on Showbiz Platform. We're excited to have you join Nigeria's premier model booking marketplace.</p>
    <div class="info-box">
      <p style="font-size:13px; font-weight:600; margin-bottom:12px; color:#C9A84C;">What happens next?</p>
      <div class="info-row"><span class="info-label">Step 1</span><span class="info-value">Admin reviews your profile</span></div>
      <div class="info-row"><span class="info-label">Step 2</span><span class="info-value">You receive an approval notification</span></div>
      <div class="info-row"><span class="info-label">Step 3</span><span class="info-value">Your profile goes live for Showbiz Owners</span></div>
      <div class="info-row"><span class="info-label">Step 4</span><span class="info-value">Start receiving and accepting bookings</span></div>
    </div>
    <p class="text">While you wait, complete your profile with photos, rates, and availability to increase your chances of getting booked.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/model/profile" class="btn">Complete Your Profile</a>
    </div>
  `, 'Your model profile is under review'),
});

// ── 2. Welcome — Showbiz Owner ────────────────────────────────────────────────
const welcomeOwner = ({ firstName }) => ({
  subject: 'Welcome to Showbiz — Start Booking Top Models',
  html: base(`
    <p class="greeting">Welcome, ${firstName}! 🎬</p>
    <p class="text">Your Showbiz Owner account is ready. You can now browse and book top Nigerian models for your events, fashion shows, commercials, and brand campaigns.</p>
    <div class="info-box">
      <p style="font-size:13px; font-weight:600; margin-bottom:12px; color:#C9A84C;">Get started in 3 steps:</p>
      <div class="info-row"><span class="info-label">1. Browse Models</span><span class="info-value">Filter by location, experience & rate</span></div>
      <div class="info-row"><span class="info-label">2. Send Booking Request</span><span class="info-value">Admin reviews and forwards to model</span></div>
      <div class="info-row"><span class="info-label">3. Pay Securely</span><span class="info-value">Via Paystack after model confirms</span></div>
    </div>
    <div style="text-align:center;">
      <a href="${BASE_URL}/owner/models" class="btn">Browse Models Now</a>
    </div>
  `, 'Start booking top Nigerian models'),
});

// ── 3. Booking Request Submitted (to owner) ───────────────────────────────────
const bookingSubmitted = ({ ownerName, booking }) => ({
  subject: 'Booking Request Submitted — ' + booking.event_title,
  html: base(`
    <p class="greeting">Booking Request Submitted</p>
    <p class="text">Hi ${ownerName}, your booking request has been submitted and is awaiting admin review. You'll be notified once it's processed.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking.event_title}</span></div>
      <div class="info-row"><span class="info-label">Event Date</span><span class="info-value">${formatDate(booking.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Location</span><span class="info-value">${booking.event_location || 'TBD'}</span></div>
      <div class="info-row"><span class="info-label">Total Amount</span><span class="info-value" style="color:#C9A84C;">${formatNaira(booking.total_amount)}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-gold">Pending Review</span></span></div>
    </div>
    <p class="text">Our admin team will review your request and forward it to the model within 24 hours.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/owner/bookings" class="btn">View Booking</a>
    </div>
  `, 'Your booking request is under review'),
});

// ── 4. Booking Approved by Admin (to model) ───────────────────────────────────
const bookingForModel = ({ modelName, booking, ownerName }) => ({
  subject: 'New Booking Request — ' + booking.event_title,
  html: base(`
    <p class="greeting">You have a new booking request! 🎉</p>
    <p class="text">Hi ${modelName}, a Showbiz Owner wants to book you for an upcoming event. Please review the details and accept or decline.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking.event_title}</span></div>
      <div class="info-row"><span class="info-label">Client</span><span class="info-value">${ownerName}</span></div>
      <div class="info-row"><span class="info-label">Event Date</span><span class="info-value">${formatDate(booking.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Location</span><span class="info-value">${booking.event_location || 'TBD'}</span></div>
      <div class="info-row"><span class="info-label">Duration</span><span class="info-value">${booking.duration_hours || 'TBD'} hours</span></div>
      <div class="info-row"><span class="info-label">Your Earnings</span><span class="info-value" style="color:#2ECC8A;">${formatNaira(booking.total_amount * 0.9)}</span></div>
    </div>
    <p class="text">⏰ Please respond within 48 hours. If no response is received, the booking may be cancelled.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/model/bookings" class="btn">Accept or Decline</a>
    </div>
  `, 'New booking request awaiting your response'),
});

// ── 5. Booking Confirmed by Model (to owner) ──────────────────────────────────
const bookingConfirmed = ({ ownerName, modelName, booking }) => ({
  subject: '✅ Booking Confirmed — ' + booking.event_title,
  html: base(`
    <p class="greeting">Great news! Your booking is confirmed ✅</p>
    <p class="text">Hi ${ownerName}, <strong>${modelName}</strong> has accepted your booking request. Please complete your payment to lock in the booking.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking.event_title}</span></div>
      <div class="info-row"><span class="info-label">Model</span><span class="info-value">${modelName}</span></div>
      <div class="info-row"><span class="info-label">Event Date</span><span class="info-value">${formatDate(booking.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Location</span><span class="info-value">${booking.event_location || 'TBD'}</span></div>
      <div class="info-row"><span class="info-label">Amount Due</span><span class="info-value" style="color:#C9A84C;">${formatNaira(booking.total_amount)}</span></div>
    </div>
    <p class="text">Complete your payment now to secure your booking. Payment is processed securely via Paystack.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/owner/bookings" class="btn">Pay Now</a>
    </div>
  `, modelName + ' accepted your booking — pay now to confirm'),
});

// ── 6. Booking Declined by Model (to owner) ───────────────────────────────────
const bookingDeclined = ({ ownerName, modelName, booking, reason }) => ({
  subject: 'Booking Declined — ' + booking.event_title,
  html: base(`
    <p class="greeting">Booking Update</p>
    <p class="text">Hi ${ownerName}, unfortunately <strong>${modelName}</strong> has declined your booking request.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking.event_title}</span></div>
      <div class="info-row"><span class="info-label">Event Date</span><span class="info-value">${formatDate(booking.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-red">Declined</span></span></div>
      ${reason ? '<div class="info-row"><span class="info-label">Reason</span><span class="info-value">' + reason + '</span></div>' : ''}
    </div>
    <p class="text">Don't worry — we have many other talented models available. Browse our platform to find the perfect fit for your event.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/owner/models" class="btn">Browse Other Models</a>
    </div>
  `, 'Your booking was declined — find another model'),
});

// ── 7. Payment Successful (to owner) ─────────────────────────────────────────
const paymentSuccess = ({ ownerName, payment, booking }) => ({
  subject: '💳 Payment Confirmed — ' + formatNaira(payment.amount),
  html: base(`
    <p class="greeting">Payment Successful! 💳</p>
    <p class="text">Hi ${ownerName}, your payment has been received and processed successfully.</p>
    <div class="amount">${formatNaira(payment.amount)}</div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking.event_title}</span></div>
      <div class="info-row"><span class="info-label">Reference</span><span class="info-value" style="font-size:11px;">${payment.provider_reference}</span></div>
      <div class="info-row"><span class="info-label">Amount Paid</span><span class="info-value" style="color:#2ECC8A;">${formatNaira(payment.amount)}</span></div>
      <div class="info-row"><span class="info-label">Platform Fee</span><span class="info-value">${formatNaira(payment.commission_amount)}</span></div>
      <div class="info-row"><span class="info-label">Payment Method</span><span class="info-value" style="text-transform:capitalize;">${payment.payment_method || 'Card'}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-green">Successful</span></span></div>
    </div>
    <p class="text">Your booking is now fully confirmed. The model has been notified and will be ready for your event.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/owner/bookings" class="btn">View Booking</a>
    </div>
  `, 'Your payment of ' + formatNaira(payment.amount) + ' was successful'),
});

// ── 8. Payout Notification (to model) ────────────────────────────────────────
const payoutProcessed = ({ modelName, payout }) => ({
  subject: '💰 Payout Processed — ' + formatNaira(payout.amount),
  html: base(`
    <p class="greeting">Your payout has been processed! 💰</p>
    <p class="text">Hi ${modelName}, great news! Your earnings have been processed and will reflect in your account shortly.</p>
    <div class="amount">${formatNaira(payout.amount)}</div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Amount</span><span class="info-value" style="color:#2ECC8A;">${formatNaira(payout.amount)}</span></div>
      ${payout.bank_name ? '<div class="info-row"><span class="info-label">Bank</span><span class="info-value">' + payout.bank_name + '</span></div>' : ''}
      ${payout.account_name ? '<div class="info-row"><span class="info-label">Account Name</span><span class="info-value">' + payout.account_name + '</span></div>' : ''}
      ${payout.account_number ? '<div class="info-row"><span class="info-label">Account Number</span><span class="info-value">' + payout.account_number + '</span></div>' : ''}
      <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-green">Completed</span></span></div>
    </div>
    <p class="text">Funds are typically available within 1-3 business days depending on your bank.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/model/bookings" class="btn">View Earnings</a>
    </div>
  `, 'Your payout of ' + formatNaira(payout.amount) + ' has been processed'),
});

// ── 9. Model Approved (to model) ─────────────────────────────────────────────
const modelApproved = ({ firstName }) => ({
  subject: '🎉 Your Profile is Now Live on Showbiz!',
  html: base(`
    <p class="greeting">Congratulations, ${firstName}! 🎉</p>
    <p class="text">Your model profile has been approved and is now live on Showbiz Platform. Showbiz Owners can now discover and book you for events!</p>
    <div class="info-box">
      <p style="font-size:13px; font-weight:600; margin-bottom:12px; color:#C9A84C;">Tips to get booked faster:</p>
      <div class="info-row"><span class="info-label">✓ Photos</span><span class="info-value">Add high-quality portfolio photos</span></div>
      <div class="info-row"><span class="info-label">✓ Availability</span><span class="info-value">Keep your calendar up to date</span></div>
      <div class="info-row"><span class="info-label">✓ Rates</span><span class="info-value">Set competitive hourly and daily rates</span></div>
      <div class="info-row"><span class="info-label">✓ Specialties</span><span class="info-value">List all your skills and specialties</span></div>
    </div>
    <div style="text-align:center;">
      <a href="${BASE_URL}/model/profile" class="btn">Update Your Profile</a>
    </div>
  `, 'Your profile is now live — start getting booked!'),
});

// ── 10. Model Rejected (to model) ────────────────────────────────────────────
const modelRejected = ({ firstName, reason }) => ({
  subject: 'Profile Review Update — Action Required',
  html: base(`
    <p class="greeting">Profile Review Update</p>
    <p class="text">Hi ${firstName}, thank you for registering on Showbiz Platform. After reviewing your profile, we were unable to approve it at this time.</p>
    ${reason ? '<div class="info-box"><div class="info-row"><span class="info-label">Reason</span><span class="info-value">' + reason + '</span></div></div>' : ''}
    <p class="text">You can update your profile and resubmit for review. Make sure your photos are clear, your information is complete, and your rates are set.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/model/profile" class="btn">Update & Resubmit</a>
    </div>
  `, 'Your profile needs updates before approval'),
});

// ── 11. Password Reset ────────────────────────────────────────────────────────
const passwordChanged = ({ firstName }) => ({
  subject: 'Password Changed Successfully',
  html: base(`
    <p class="greeting">Password Updated</p>
    <p class="text">Hi ${firstName}, your password has been changed successfully.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Action</span><span class="info-value">Password changed</span></div>
      <div class="info-row"><span class="info-label">Time</span><span class="info-value">${new Date().toLocaleString('en-NG')}</span></div>
    </div>
    <p class="text">If you did not make this change, please contact our admin team immediately via the platform messaging system.</p>
    <div style="text-align:center;">
      <a href="${BASE_URL}/login" class="btn">Login to Your Account</a>
    </div>
  `, 'Your Showbiz password was changed'),
});

// ── 12. Admin alert — new booking ─────────────────────────────────────────────
const adminNewBooking = ({ booking, ownerName, modelName }) => ({
  subject: '🔔 New Booking Request — ' + booking.event_title,
  html: base(`
    <p class="greeting">New Booking Request</p>
    <p class="text">A new booking request has been submitted and is awaiting your review.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking.event_title}</span></div>
      <div class="info-row"><span class="info-label">Owner</span><span class="info-value">${ownerName}</span></div>
      <div class="info-row"><span class="info-label">Model</span><span class="info-value">${modelName}</span></div>
      <div class="info-row"><span class="info-label">Date</span><span class="info-value">${formatDate(booking.event_date)}</span></div>
      <div class="info-row"><span class="info-label">Amount</span><span class="info-value" style="color:#C9A84C;">${formatNaira(booking.total_amount)}</span></div>
    </div>
    <div style="text-align:center;">
      <a href="${BASE_URL}/admin/bookings" class="btn">Review Booking</a>
    </div>
  `, 'New booking request needs your review'),
});

module.exports = {
  base,
  welcomeModel, welcomeOwner,
  bookingSubmitted, bookingForModel,
  bookingConfirmed, bookingDeclined,
  paymentSuccess, payoutProcessed,
  modelApproved, modelRejected,
  passwordChanged, adminNewBooking,
};
