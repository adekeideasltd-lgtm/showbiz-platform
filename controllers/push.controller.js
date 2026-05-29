'use strict';
const webpush = require('web-push');
const db = require('../models');

webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:admin@showbiz.ng',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const getVapidKey = (req, res) => {
  return res.json({ status: 'success', data: { publicKey: process.env.VAPID_PUBLIC_KEY } });
};

const subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth)
      return res.status(400).json({ status: 'error', message: 'Invalid subscription data.' });
    const [sub, created] = await db.PushSubscription.findOrCreate({
      where: { user_id: req.user.id, endpoint },
      defaults: { user_id: req.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, user_agent: req.headers['user-agent']?.slice(0, 300) },
    });
    if (!created) await sub.update({ p256dh: keys.p256dh, auth: keys.auth });
    return res.json({ status: 'success', message: 'Subscribed.' });
  } catch (err) {
    console.error('[push.subscribe]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to subscribe.' });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    await db.PushSubscription.destroy({ where: { user_id: req.user.id, endpoint } });
    return res.json({ status: 'success', message: 'Unsubscribed.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed.' });
  }
};

const sendPushToUser = async (userId, payload) => {
  try {
    const subs = await db.PushSubscription.findAll({ where: { user_id: userId } });
    await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch(async (err) => {
        if (err.statusCode === 410 || err.statusCode === 404) await sub.destroy();
      })
    ));
  } catch (err) { console.error('[sendPushToUser]', err.message); }
};

const broadcastPush = async (payload, audienceUserIds = null) => {
  try {
    const where = audienceUserIds ? { user_id: audienceUserIds } : {};
    const subs = await db.PushSubscription.findAll({ where });
    await Promise.allSettled(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      ).catch(async (err) => {
        if (err.statusCode === 410 || err.statusCode === 404) await sub.destroy();
      })
    ));
  } catch (err) { console.error('[broadcastPush]', err.message); }
};

const adminBroadcast = async (req, res) => {
  try {
    const { title, body, url } = req.body;
    if (!title || !body)
      return res.status(400).json({ status: 'error', message: 'Title and body required.' });
    await broadcastPush({ title, body, url: url || '/', icon: '/logo192.png' });
    return res.json({ status: 'success', message: 'Broadcast sent.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Broadcast failed.' });
  }
};

module.exports = { getVapidKey, subscribe, unsubscribe, sendPushToUser, broadcastPush, adminBroadcast };
