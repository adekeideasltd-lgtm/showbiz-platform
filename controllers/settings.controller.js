'use strict';
const db = require('../models');

// ── Helper: get setting value ─────────────────────────────────────────────────
const getSetting = async (key, defaultValue = null) => {
  const setting = await db.Setting.findOne({ where: { key } });
  if (!setting) return defaultValue;
  if (setting.type === 'number')  return parseFloat(setting.value);
  if (setting.type === 'boolean') return setting.value === 'true';
  if (setting.type === 'json')    try { return JSON.parse(setting.value); } catch { return defaultValue; }
  return setting.value;
};

// ── GET /api/admin/settings ───────────────────────────────────────────────────
const listSettings = async (req, res) => {
  try {
    const settings = await db.Setting.findAll({ order: [['key', 'ASC']] });
    return res.json({ status: 'success', data: settings });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch settings.' });
  }
};

// ── PUT /api/admin/settings/:key ──────────────────────────────────────────────
const updateSetting = async (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined || value === null)
      return res.status(400).json({ status: 'error', message: 'Value required.' });

    const setting = await db.Setting.findOne({ where: { key: req.params.key } });
    if (!setting) return res.status(404).json({ status: 'error', message: 'Setting not found.' });

    // Validate
    if (setting.type === 'number' && isNaN(parseFloat(value)))
      return res.status(400).json({ status: 'error', message: 'Value must be a number.' });
    if (setting.type === 'boolean' && !['true','false'].includes(String(value)))
      return res.status(400).json({ status: 'error', message: 'Value must be true or false.' });

    await setting.update({ value: String(value), updated_by: req.user.id });

    console.log('[Settings] Updated:', req.params.key, '=', value, 'by', req.user.email);
    return res.json({ status: 'success', message: 'Setting updated.', data: setting });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update setting.' });
  }
};

// ── PUT /api/admin/settings (bulk update) ────────────────────────────────────
const bulkUpdate = async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object')
      return res.status(400).json({ status: 'error', message: 'Settings object required.' });

    for (const [key, value] of Object.entries(settings)) {
      await db.Setting.update(
        { value: String(value), updated_by: req.user.id },
        { where: { key } }
      );
    }

    console.log('[Settings] Bulk updated by', req.user.email);
    return res.json({ status: 'success', message: 'Settings updated successfully.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update settings.' });
  }
};

// ── GET /api/settings/public ──────────────────────────────────────────────────
const publicSettings = async (req, res) => {
  try {
    const keys = ['platform_name', 'min_booking_amount', 'max_booking_amount', 'maintenance_mode'];
    const settings = await db.Setting.findAll({ where: { key: keys } });
    const data = {};
    settings.forEach(s => {
      if (s.type === 'number')  data[s.key] = parseFloat(s.value);
      else if (s.type === 'boolean') data[s.key] = s.value === 'true';
      else data[s.key] = s.value;
    });
    return res.json({ status: 'success', data });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

module.exports = { listSettings, updateSetting, bulkUpdate, publicSettings, getSetting };
