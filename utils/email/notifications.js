'use strict';

const { sendEmail }  = require('./mailer');
const { base: baseTemplate } = require('./templates');
const templates      = require('./templates');

const ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'superadmin@showbiz.ng';

const onModelRegistered = async (user) => {
  await sendEmail({ to: user.email, ...templates.welcomeModel({ firstName: user.first_name }) });
};

const onOwnerRegistered = async (user) => {
  await sendEmail({ to: user.email, ...templates.welcomeOwner({ firstName: user.first_name }) });
};

const onModelApproved = async (user) => {
  await sendEmail({ to: user.email, ...templates.modelApproved({ firstName: user.first_name }) });
};

const onModelRejected = async (user, reason) => {
  await sendEmail({ to: user.email, ...templates.modelRejected({ firstName: user.first_name, reason }) });
};

const onPasswordChanged = async (user) => {
  await sendEmail({ to: user.email, ...templates.passwordChanged({ firstName: user.first_name }) });
};

const onBookingCreated = async (booking, owner, model) => {
  await sendEmail({ to: owner.email, ...templates.bookingSubmitted({ ownerName: owner.first_name, booking }) });
  await sendEmail({ to: ADMIN_EMAIL, ...templates.adminNewBooking({ booking, ownerName: owner.first_name + ' ' + owner.last_name, modelName: model.first_name + ' ' + model.last_name }) });
};

const onBookingApprovedByAdmin = async (booking, model, owner) => {
  await sendEmail({ to: model.email, ...templates.bookingForModel({ modelName: model.first_name, booking, ownerName: owner.first_name + ' ' + owner.last_name }) });
};

const onBookingConfirmedByModel = async (booking, owner, model) => {
  await sendEmail({ to: owner.email, ...templates.bookingConfirmed({ ownerName: owner.first_name, modelName: model.first_name + ' ' + model.last_name, booking }) });
};

const onBookingDeclinedByModel = async (booking, owner, model, reason) => {
  await sendEmail({ to: owner.email, ...templates.bookingDeclined({ ownerName: owner.first_name, modelName: model.first_name + ' ' + model.last_name, booking, reason }) });
};

const onPaymentSuccess = async (payment, booking, owner) => {
  await sendEmail({ to: owner.email, ...templates.paymentSuccess({ ownerName: owner.first_name, payment, booking }) });
};

const onPayoutProcessed = async (payout, model) => {
  await sendEmail({ to: model.email, ...templates.payoutProcessed({ modelName: model.first_name, payout }) });
};

// placeholder - exports at bottom

// ── KYC Notifications ─────────────────────────────────────────────────────────
const onKYCSubmitted = async (user) => {
  // Notify admin
  await sendEmail({
    to: process.env.SUPER_ADMIN_EMAIL,
    subject: 'New KYC Submission — ' + user.first_name + ' ' + user.last_name,
    html: baseTemplate('New KYC Submission', `
      <p>A new KYC verification has been submitted and requires your review.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;color:#8884A0;font-size:13px;">Name</td><td style="padding:8px;font-weight:600;">${user.first_name} ${user.last_name}</td></tr>
        <tr><td style="padding:8px;color:#8884A0;font-size:13px;">Email</td><td style="padding:8px;">${user.email}</td></tr>
        <tr><td style="padding:8px;color:#8884A0;font-size:13px;">Submitted</td><td style="padding:8px;">${new Date().toLocaleString()}</td></tr>
      </table>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.FRONTEND_URL}/admin/kyc" style="display:inline-block;padding:12px 28px;background:#C9A84C;color:#0A0A0F;text-decoration:none;border-radius:8px;font-weight:700;">Review KYC</a>
      </div>
    `),
  });

  // Notify user
  await sendEmail({
    to: user.email,
    subject: 'KYC Submitted — Showbiz Platform',
    html: baseTemplate('KYC Submitted Successfully', `
      <p>Hi ${user.first_name},</p>
      <p>Your KYC verification documents have been received. Our team will review them within <strong>24-48 hours</strong>.</p>
      <p>You will receive an email once your verification is complete.</p>
      <div style="background:#1A1A26;border:1px solid #2E2E42;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="font-size:13px;color:#8884A0;margin:0;">What happens next?</p>
        <ul style="color:#F0EEF8;font-size:14px;line-height:1.8;margin:8px 0 0;">
          <li>Our team reviews your documents</li>
          <li>You receive an approval or rejection email</li>
          <li>Upon approval, you get full platform access</li>
        </ul>
      </div>
    `),
  });
};

const onKYCApproved = async (user) => {
  await sendEmail({
    to: user.email,
    subject: '✅ KYC Approved — You are now verified on Showbiz!',
    html: baseTemplate('KYC Verification Approved!', `
      <p>Hi ${user.first_name},</p>
      <p style="font-size:16px;color:#2ECC8A;font-weight:700;">🎉 Congratulations! Your identity has been verified.</p>
      <p>You now have full access to all Showbiz Platform features including:</p>
      <ul style="color:#F0EEF8;font-size:14px;line-height:1.8;">
        <li>✓ Browse and book professional models</li>
        <li>✓ Receive and accept booking requests</li>
        <li>✓ Process and receive payments</li>
        <li>✓ Display a verified badge on your profile</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.FRONTEND_URL}" style="display:inline-block;padding:12px 28px;background:#C9A84C;color:#0A0A0F;text-decoration:none;border-radius:8px;font-weight:700;">Go to Dashboard</a>
      </div>
    `),
  });
};

const onKYCRejected = async (user, reason) => {
  await sendEmail({
    to: user.email,
    subject: 'KYC Verification Update — Action Required',
    html: baseTemplate('KYC Verification Unsuccessful', `
      <p>Hi ${user.first_name},</p>
      <p>Unfortunately, we were unable to verify your identity with the documents submitted.</p>
      <div style="background:#2D1515;border:1px solid rgba(232,92,92,0.3);border-radius:8px;padding:16px;margin:16px 0;">
        <p style="font-size:12px;color:#E85C5C;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Reason</p>
        <p style="color:#F0EEF8;font-size:14px;margin:0;">${reason}</p>
      </div>
      <p style="font-size:14px;color:#8884A0;">Please resubmit your KYC with the correct documents. Common issues include:</p>
      <ul style="color:#8884A0;font-size:13px;line-height:1.8;">
        <li>Documents are blurry or unreadable</li>
        <li>Expired ID documents</li>
        <li>Selfie does not clearly match the ID</li>
        <li>Documents are more than 3 months old</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.FRONTEND_URL}/model/kyc" style="display:inline-block;padding:12px 28px;background:#C9A84C;color:#0A0A0F;text-decoration:none;border-radius:8px;font-weight:700;">Resubmit KYC</a>
      </div>
    `),
  });
};

const onContactForm = async ({ name, email, subject, message }) => {
  await sendEmail({
    to: process.env.SUPER_ADMIN_EMAIL,
    subject: 'Contact Form: ' + subject,
    html: baseTemplate('New Contact Form Submission', `
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:8px;color:#8884A0;font-size:13px;width:120px;">Name</td><td style="padding:8px;font-weight:600;">${name}</td></tr>
        <tr><td style="padding:8px;color:#8884A0;font-size:13px;">Email</td><td style="padding:8px;">${email}</td></tr>
        <tr><td style="padding:8px;color:#8884A0;font-size:13px;">Subject</td><td style="padding:8px;">${subject}</td></tr>
        <tr><td style="padding:8px;color:#8884A0;font-size:13px;vertical-align:top;">Message</td><td style="padding:8px;line-height:1.7;">${message}</td></tr>
      </table>
      <div style="text-align:center;margin:24px 0;">
        <a href="mailto:${email}" style="display:inline-block;padding:12px 28px;background:#C9A84C;color:#0A0A0F;text-decoration:none;border-radius:8px;font-weight:700;">Reply to ${name}</a>
      </div>
    `),
  });

  // Auto-reply to sender
  await sendEmail({
    to: email,
    subject: 'We received your message — Showbiz Platform',
    html: baseTemplate('Thanks for reaching out!', `
      <p>Hi ${name},</p>
      <p>Thank you for contacting Showbiz Platform. We have received your message and will respond within <strong>24 hours</strong>.</p>
      <div style="background:#1A1A26;border:1px solid #2E2E42;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="font-size:12px;color:#8884A0;margin-bottom:6px;text-transform:uppercase;letter-spacing:1px;">Your message</p>
        <p style="color:#F0EEF8;font-size:14px;line-height:1.7;margin:0;">${message}</p>
      </div>
      <p style="color:#8884A0;font-size:14px;">In the meantime, feel free to browse our <a href="${process.env.FRONTEND_URL}/models" style="color:#C9A84C;">model listings</a> or check our <a href="${process.env.FRONTEND_URL}/faq" style="color:#C9A84C;">FAQ</a>.</p>
    `),
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
  onContactForm,
};
