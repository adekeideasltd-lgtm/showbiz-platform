const db = require('../models');
const { Op } = require('sequelize');

// GET /api/notifications
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { count, rows } = await db.Notification.findAndCountAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    const unread = await db.Notification.count({ where: { user_id: req.user.id, is_read: false } });
    return res.json({ status: 'success', data: { notifications: rows, unread, pagination: { total: count, page: parseInt(page), pages: Math.ceil(count / parseInt(limit)) } } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch notifications.' });
  }
};

// POST /api/notifications/mark-read
const markRead = async (req, res) => {
  try {
    const { ids } = req.body; // array of ids or 'all'
    if (ids === 'all') {
      await db.Notification.update({ is_read: true }, { where: { user_id: req.user.id } });
    } else if (Array.isArray(ids)) {
      await db.Notification.update({ is_read: true }, { where: { user_id: req.user.id, id: { [Op.in]: ids } } });
    }
    return res.json({ status: 'success', message: 'Marked as read.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to mark notifications as read.' });
  }
};

// GET /api/notifications/unread-count
const getUnreadCount = async (req, res) => {
  try {
    const count = await db.Notification.count({ where: { user_id: req.user.id, is_read: false } });
    return res.json({ status: 'success', data: { unread: count } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to get unread count.' });
  }
};

// DELETE /api/notifications/:id
const deleteNotification = async (req, res) => {
  try {
    await db.Notification.destroy({ where: { id: req.params.id, user_id: req.user.id } });
    return res.json({ status: 'success', message: 'Notification deleted.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to delete notification.' });
  }
};

// DELETE /api/notifications — clear all
const clearNotifications = async (req, res) => {
  try {
    await db.Notification.destroy({ where: { user_id: req.user.id } });
    return res.json({ status: 'success', message: 'All notifications cleared.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to clear notifications.' });
  }
};

module.exports = { getNotifications, markRead, getUnreadCount, deleteNotification, clearNotifications };
