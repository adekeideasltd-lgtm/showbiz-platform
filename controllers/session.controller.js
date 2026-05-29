'use strict';
const db     = require('../models');
const bcrypt = require('bcryptjs');
const UAParser = require('ua-parser-js');

// ── GET /api/auth/sessions ────────────────────────────────────────────────────
const listSessions = async (req, res) => {
  try {
    const sessions = await db.ActiveSession.findAll({
      where: { user_id: req.user.id, is_revoked: false },
      order: [['created_at', 'DESC']],
    });

    const data = sessions.map(s => {
      const ua     = new UAParser(s.user_agent || '');
      const browser = ua.getBrowser();
      const os      = ua.getOS();
      const device  = ua.getDevice();
      return {
        id:          s.id,
        ip_address:  s.ip_address || 'Unknown',
        browser:     browser.name ? `${browser.name} ${browser.version || ''}`.trim() : 'Unknown Browser',
        os:          os.name      ? `${os.name} ${os.version || ''}`.trim()      : 'Unknown OS',
        device:      device.type  ? device.type  : 'Desktop',
        created_at:  s.created_at,
        expires_at:  s.expires_at,
        is_current:  false, // we can't easily tell which is current without token comparison
      };
    });

    return res.json({ status: 'success', data });
  } catch (err) {
    console.error('[listSessions]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch sessions.' });
  }
};

// ── DELETE /api/auth/sessions/:id ─────────────────────────────────────────────
const revokeSession = async (req, res) => {
  try {
    const session = await db.ActiveSession.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!session) return res.status(404).json({ status: 'error', message: 'Session not found.' });

    await session.update({ is_revoked: true });
    return res.json({ status: 'success', message: 'Session revoked.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to revoke session.' });
  }
};

// ── DELETE /api/auth/sessions ─────────────────────────────────────────────────
const revokeAllSessions = async (req, res) => {
  try {
    await db.ActiveSession.update(
      { is_revoked: true },
      { where: { user_id: req.user.id, is_revoked: false } }
    );
    return res.json({ status: 'success', message: 'All sessions revoked.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to revoke sessions.' });
  }
};

module.exports = { listSessions, revokeSession, revokeAllSessions };
