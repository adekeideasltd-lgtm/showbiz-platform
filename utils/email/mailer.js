'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

// Verify connection on startup
transporter.verify((err) => {
  if (err) {
    console.error('[Email] Connection failed:', err.message);
  } else {
    console.log('[Email] SMTP connection ready');
  }
});

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from:    process.env.EMAIL_FROM || 'Showbiz Platform <noreply@showbiz.ng>',
      to,
      subject,
      html,
      text: text || subject,
    });
    console.log('[Email] Sent to', to, '—', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Failed to send to', to, '—', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { sendEmail };
