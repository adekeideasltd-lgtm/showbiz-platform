/**
 * healthCheck.js
 * Internal health check — pings localhost (not an external curl call,
 * which avoids the hosting provider's cron security flag) and restarts
 * the app via the start script if it's unresponsive.
 *
 * Sends an email alert on state CHANGE only (healthy -> down, or down -> recovered)
 * to avoid spamming the admin every 5 minutes while an outage persists.
 *
 * Run via cron every 5 minutes.
 */
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const nodemailer = require('nodemailer');

const STATE_FILE = path.join(__dirname, '..', '.health_state');
const ALERT_TO = process.env.ADMIN_ALERT_EMAIL;

const getLastState = () => {
  try { return fs.readFileSync(STATE_FILE, 'utf8').trim(); }
  catch { return 'up'; } // assume up if no state file exists yet
};

const setState = (state) => {
  try { fs.writeFileSync(STATE_FILE, state); } catch (e) { console.error('[healthCheck] Could not write state file:', e.message); }
};

const sendAlert = async (subject, message) => {
  if (!ALERT_TO || !process.env.EMAIL_USER) {
    console.log('[healthCheck] Alert email not configured, skipping send. Message:', subject);
    return;
  }
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Twerkie Platform <noreply@twerkie.com>',
      to: ALERT_TO,
      subject,
      text: message,
      html: `<p style="font-family:Arial,sans-serif;font-size:14px;">${message}</p>`,
    });
    console.log('[healthCheck] Alert email sent:', subject);
  } catch (err) {
    console.error('[healthCheck] Failed to send alert email:', err.message);
  }
};

const options = { host: 'localhost', port: 3000, path: '/', timeout: 5000 };

const handleDown = async (reason) => {
  const lastState = getLastState();
  console.log(`[healthCheck] DOWN (${reason}) at ${new Date().toISOString()}, restarting...`);

  if (lastState === 'up') {
    setState('down');
    await sendAlert(
      '🔴 Twerkie API is DOWN',
      `The Twerkie API health check failed at ${new Date().toISOString()}.\nReason: ${reason}\n\nAn automatic restart has been triggered. You will receive a follow-up email once the API recovers.`
    );
  }

  exec(`${process.env.HOME}/start_twerkie.sh`, (error, stdout) => {
    if (error) console.error(`[healthCheck] Restart error: ${error.message}`);
    else console.log(`[healthCheck] Restart triggered: ${stdout}`);
    process.exit(1);
  });
};

const handleUp = async () => {
  const lastState = getLastState();
  console.log(`[healthCheck] OK at ${new Date().toISOString()}`);

  if (lastState === 'down') {
    setState('up');
    await sendAlert(
      '🟢 Twerkie API has RECOVERED',
      `The Twerkie API is back online as of ${new Date().toISOString()}.`
    );
  }
  process.exit(0);
};

const req = http.get(options, (res) => {
  if (res.statusCode === 200 || res.statusCode === 301) {
    handleUp();
  } else {
    handleDown(`Unexpected status code ${res.statusCode}`);
  }
});

req.on('error', (err) => handleDown(err.message));
req.on('timeout', () => { req.destroy(); handleDown('Request timed out'); });
