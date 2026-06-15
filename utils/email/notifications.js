'use strict';

const { sendEmail } = require('./mailer');
const templates = require('./templates');
const { base } = templates;

const safe = (val, fallback = 'there') => (val && val !== 'undefined' && val !== 'null') ? val : fallback;
const formatNaira = (n) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(n || 0);
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://twerkie.com';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@twerkie.com';

// ── Registration ──────────────────────────────────────────────────────────────
const onModelRegistered = async (user) => {
  await sendEmail({ to: user.email, ...templates.welcomeModel({ firstName: safe(user.first_name) }) });
};
const onOwnerRegistered = async (user) => {
  await sendEmail({ to: user.email, ...templates.welcomeOwner({ firstName: safe(user.first_name) }) });
};

// ── Profile ───────────────────────────────────────────────────────────────────
const onModelApproved = async (user) => {
  await sendEmail({ to: user.email, ...templates.modelApproved({ firstName: safe(user.first_name) }) });
};
const onModelRejected = async (user, reason) => {
  await sendEmail({ to: user.email, ...templates.modelRejected({ firstName: safe(user.first_name), reason }) });
};

// ── Auth ──────────────────────────────────────────────────────────────────────
const onPasswordChanged = async (user) => {
  await sendEmail({ to: user.email, ...templates.passwordChanged({ firstName: safe(user.first_name) }) });
};

// ── Bookings ──────────────────────────────────────────────────────────────────
const onBookingCreated = async (booking, owner, modelUser) => {
  await sendEmail({ to: owner.email, ...templates.bookingSubmitted({ ownerName: safe(owner.first_name), booking }) });
};
const onBookingApprovedByAdmin = async (booking, modelUser, owner) => {
  if (owner?.email) await sendEmail({ to: owner.email, ...templates.bookingApprovedByAdmin({ firstName: safe(owner.first_name), booking }) });
  if (modelUser?.email) await sendEmail({ to: modelUser.email, ...templates.bookingForModel({ modelName: safe(modelUser.first_name), booking, ownerName: safe(owner?.first_name) + ' ' + safe(owner?.last_name, '') }) });
};
const onBookingConfirmedByModel = async (booking, owner, modelUser) => {
  const modelName = safe(modelUser?.first_name, 'The entertainer') + ' ' + safe(modelUser?.last_name, '');
  await sendEmail({ to: owner.email, ...templates.bookingConfirmed({ ownerName: safe(owner.first_name), modelName: modelName.trim(), booking }) });
};
const onBookingDeclinedByModel = async (booking, owner, modelUser, reason) => {
  const modelName = safe(modelUser?.first_name, 'The entertainer') + ' ' + safe(modelUser?.last_name, '');
  await sendEmail({ to: owner.email, ...templates.bookingDeclined({ ownerName: safe(owner.first_name), modelName: modelName.trim(), booking, reason }) });
};

// ── Payments ──────────────────────────────────────────────────────────────────
const onPaymentSuccess = async (payment, booking, owner) => {
  await sendEmail({ to: owner.email, ...templates.paymentSuccess({ ownerName: safe(owner.first_name), payment, booking }) });
};
const onPayoutProcessed = async (payout, model) => {
  await sendEmail({ to: model.email, ...templates.payoutProcessed({ modelName: safe(model.first_name), payout }) });
};

// ── Wallet ────────────────────────────────────────────────────────────────────
const onWalletCredited = async (user, amount, description) => {
  if (!user?.email) return;
  await sendEmail({
    to: user.email,
    subject: 'Your Twerkie wallet has been credited',
    html: base(`
      <p class="greeting">Hi ${safe(user.first_name)},</p>
      <p class="text">Your Twerkie wallet has been credited.</p>
      <div class="amount-label">Amount Credited</div>
      <div class="amount">${formatNaira(amount)}</div>
      ${description ? `<div class="highlight">${description}</div>` : ''}
      <div style="text-align:center;margin:28px 0;">
        <a href="${FRONTEND_URL}/owner/wallet" class="btn">View Wallet</a>
      </div>
    `, 'Your wallet has been credited'),
  });
};

// ── KYC ───────────────────────────────────────────────────────────────────────
const onKYCSubmitted = async (user) => {
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || SUPPORT_EMAIL;
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `New KYC Submission — ${safe(user.first_name, '')} ${safe(user.last_name, '')}`.trim(),
    html: base(`
      <p class="greeting">New KYC Submission</p>
      <p class="text">A new KYC verification requires your review.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${safe(user.first_name, '')} ${safe(user.last_name, '')}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${user.email || '-'}</span></div>
        <div class="info-row"><span class="info-label">Submitted</span><span class="info-value">${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      </div>
      <div style="text-align:center;margin:28px 0;">
        <a href="${FRONTEND_URL}/admin/kyc" class="btn">Review KYC</a>
      </div>
    `, 'New KYC submission requires review'),
  });

  await sendEmail({
    to: user.email,
    subject: 'KYC submitted — Twerkie',
    html: base(`
      <p class="greeting">Hi ${safe(user.first_name)},</p>
      <p class="text">Your KYC verification documents have been received. Our team will review them within <strong>24–48 hours</strong>.</p>
      <div class="highlight">
        Once approved, you will have full access to all platform features and your profile will be visible to show owners.
      </div>
      <p class="text">You will receive an email as soon as your verification is complete.</p>
    `, 'KYC documents received'),
  });
};

const onKYCApproved = async (user) => {
  await sendEmail({
    to: user.email,
    subject: 'Your KYC has been approved — Twerkie',
    html: base(`
      <p class="greeting">Congratulations, ${safe(user.first_name)}!</p>
      <p class="text">Your identity has been verified. You now have full access to all Twerkie platform features.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-success">Verified</span></span></div>
        <div class="info-row"><span class="info-label">Approved</span><span class="info-value">${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
      </div>
      <div style="text-align:center;margin:28px 0;">
        <a href="${FRONTEND_URL}" class="btn">Go to Dashboard</a>
      </div>
    `, 'Your KYC has been approved'),
  });
};

const onKYCRejected = async (user, reason) => {
  await sendEmail({
    to: user.email,
    subject: 'KYC verification update — Twerkie',
    html: base(`
      <p class="greeting">Hi ${safe(user.first_name)},</p>
      <p class="text">Thank you for submitting your KYC documents. Unfortunately, we were unable to verify your identity at this time.</p>
      ${reason ? `<div class="highlight"><strong>Reason:</strong> ${reason}</div>` : ''}
      <p class="text">Please resubmit with clear, valid documents. Common issues include blurry images, expired IDs, or mismatched selfies.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${FRONTEND_URL}/model/kyc" class="btn">Resubmit KYC</a>
      </div>
    `, 'Action required on your KYC submission'),
  });
};

// ── Contact Form ──────────────────────────────────────────────────────────────
const onContactForm = async ({ name, email, subject, message }) => {
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || SUPPORT_EMAIL;
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `Contact: ${subject || 'New message'}`,
    html: base(`
      <p class="greeting">New Contact Form Submission</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Name</span><span class="info-value">${safe(name, 'Unknown')}</span></div>
        <div class="info-row"><span class="info-label">Email</span><span class="info-value">${email || '-'}</span></div>
        <div class="info-row"><span class="info-label">Subject</span><span class="info-value">${subject || '-'}</span></div>
      </div>
      <div class="highlight">${message || '-'}</div>
      <div style="text-align:center;margin:28px 0;">
        <a href="mailto:${email}" class="btn">Reply to ${safe(name, 'Sender')}</a>
      </div>
    `, `New contact: ${subject || ''}`),
  });

  await sendEmail({
    to: email,
    subject: 'We received your message — Twerkie',
    html: base(`
      <p class="greeting">Hi ${safe(name)},</p>
      <p class="text">Thank you for reaching out. We have received your message and will get back to you within <strong>24 hours</strong>.</p>
      <div class="highlight">${message || '-'}</div>
      <p class="text" style="font-size:12px;color:#aaaaaa;">If your query is urgent, email us directly at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1a1a1a;">${SUPPORT_EMAIL}</a>.</p>
    `, 'We received your message'),
  });
};

// ── Reports ───────────────────────────────────────────────────────────────────
const onReportReplied = async (user, report, reply) => {
  await sendEmail({
    to: user.email,
    subject: 'Update on your report — Twerkie',
    html: base(`
      <p class="greeting">Hi ${safe(user.first_name)},</p>
      <p class="text">Our team has reviewed your ${report?.type || 'report'} and provided a response.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Subject</span><span class="info-value">${report?.subject || '-'}</span></div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-success">${report?.status || 'Resolved'}</span></span></div>
      </div>
      <div class="highlight"><strong>Admin Response:</strong><br/>${reply || '-'}</div>
      <div style="text-align:center;margin:28px 0;">
        <a href="${FRONTEND_URL}" class="btn">Go to Dashboard</a>
      </div>
    `, 'Update on your report'),
  });
};

// ── Announcements ─────────────────────────────────────────────────────────────
const onAnnouncement = async (announcement, sender) => {
  const db = require('../../models');
  const { Op } = require('sequelize');
  const roleMap = { all: null, models: 'model', owners: 'showbiz_owner', admins: 'admin' };
  const targetRole = roleMap[announcement.audience];

  let users = [];
  if (!targetRole) {
    users = await db.User.findAll({ where: { is_active: true }, attributes: ['email', 'first_name'] });
  } else {
    const roleRecord = await db.Role.findOne({ where: { name: targetRole } });
    if (roleRecord) {
      const userRoles = await db.UserRole.findAll({ where: { role_id: roleRecord.id } });
      const ids = userRoles.map(ur => ur.user_id);
      users = await db.User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ['email', 'first_name'] });
    }
  }

  for (const user of users.slice(0, 100)) {
    await sendEmail({
      to: user.email,
      subject: `${announcement.title} — Twerkie`,
      html: base(`
        <p class="greeting">${announcement.title}</p>
        <div class="highlight">${announcement.message || ''}</div>
        <div style="text-align:center;margin:28px 0;">
          <a href="${FRONTEND_URL}" class="btn">Go to Dashboard</a>
        </div>
      `, announcement.title),
    }).catch(() => {});
  }
};

// ── Bank Transfer ─────────────────────────────────────────────────────────────
const onBankTransferConfirmed = async (user, transfer) => {
  await sendEmail({
    to: user.email,
    subject: 'Bank transfer confirmed — Twerkie',
    html: base(`
      <p class="greeting">Hi ${safe(user.first_name)},</p>
      <p class="text">Your bank transfer has been confirmed and your wallet has been credited.</p>
      <div class="amount-label">Amount Credited</div>
      <div class="amount">${formatNaira(transfer?.amount)}</div>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Reference</span><span class="info-value">${transfer?.reference || '-'}</span></div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value"><span class="badge badge-success">Confirmed</span></span></div>
      </div>
      <div style="text-align:center;margin:28px 0;">
        <a href="${FRONTEND_URL}/owner/wallet" class="btn">View Wallet</a>
      </div>
    `, 'Bank transfer confirmed'),
  });
};

// ── Admin Notifications ───────────────────────────────────────────────────────
const onNewBookingAdmin = async (booking, owner, model) => {
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || SUPPORT_EMAIL;
  const ownerName = safe(owner?.first_name, '') + ' ' + safe(owner?.last_name, '');
  const entertainerName = safe(model?.user?.first_name, '') + ' ' + safe(model?.user?.last_name, '');
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `New booking — ${booking?.event_title || 'Event'}`,
    html: base(`
      <p class="greeting">New Booking Request</p>
      <p class="text">A new booking has been submitted and requires your review.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking?.event_title || '-'}</span></div>
        <div class="info-row"><span class="info-label">Show Owner</span><span class="info-value">${ownerName.trim() || '-'}</span></div>
        <div class="info-row"><span class="info-label">Entertainer</span><span class="info-value">${entertainerName.trim() || '-'}</span></div>
        <div class="info-row"><span class="info-label">Date</span><span class="info-value">${booking?.event_date || '-'}</span></div>
        <div class="info-row"><span class="info-label">Amount</span><span class="info-value">${formatNaira(booking?.total_amount)}</span></div>
      </div>
      <div style="text-align:center;margin:28px 0;">
        <a href="${FRONTEND_URL}/admin/bookings" class="btn">Review Booking</a>
      </div>
    `, 'New booking requires review'),
  });
};

const onNewBankTransferAdmin = async (user, transfer) => {
  const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || SUPPORT_EMAIL;
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `Bank transfer submission — ${formatNaira(transfer?.amount)}`,
    html: base(`
      <p class="greeting">New Bank Transfer Submission</p>
      <p class="text">${safe(user?.first_name, '')} ${safe(user?.last_name, '')} submitted a bank transfer for confirmation.</p>
      <div class="info-box">
        <div class="info-row"><span class="info-label">Amount</span><span class="info-value">${formatNaira(transfer?.amount)}</span></div>
        <div class="info-row"><span class="info-label">Reference</span><span class="info-value">${transfer?.reference || '-'}</span></div>
        <div class="info-row"><span class="info-label">Bank</span><span class="info-value">${transfer?.bank_name || '-'}</span></div>
      </div>
      <div style="text-align:center;margin:28px 0;">
        <a href="${FRONTEND_URL}/admin/bank-transfers" class="btn">Confirm Transfer</a>
      </div>
    `, 'Bank transfer requires confirmation'),
  });
};

const onAccountSuspended = async (user, reason) => {
  await sendEmail({
    to: user.email,
    subject: 'Your Twerkie account has been suspended',
    html: base(`
      <p class="greeting">Hi ${safe(user.first_name)},</p>
      <p class="text">Your Twerkie account has been suspended. Please contact support for assistance.</p>
      ${reason ? `<div class="highlight"><strong>Reason:</strong> ${reason}</div>` : ''}
      <div style="text-align:center;margin:28px 0;">
        <a href="mailto:${SUPPORT_EMAIL}" class="btn">Contact Support</a>
      </div>
    `, 'Your account has been suspended'),
  });
};

module.exports = {
  onModelRegistered, onOwnerRegistered,
  onModelApproved, onModelRejected,
  onPasswordChanged,
  onBookingCreated, onBookingApprovedByAdmin,
  onBookingConfirmedByModel, onBookingDeclinedByModel,
  onPaymentSuccess, onPayoutProcessed,
  onKYCSubmitted, onKYCApproved, onKYCRejected,
  onContactForm, onReportReplied, onAnnouncement,
  onBankTransferConfirmed, onNewBookingAdmin,
  onNewBankTransferAdmin, onWalletCredited, onAccountSuspended,
};
