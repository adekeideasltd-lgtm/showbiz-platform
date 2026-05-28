'use strict';

const db = require('../models');

const createAuditLog = async ({ actorId, actorRole, action, entityType, entityId = null, oldValue = null, newValue = null, ipAddress = null, userAgent = null }) => {
  try {
    await db.AuditLog.create({
      actor_id: actorId, actor_role: actorRole, action,
      entity_type: entityType, entity_id: entityId,
      old_value: oldValue, new_value: newValue,
      ip_address: ipAddress, user_agent: userAgent,
    });
  } catch (err) {
    console.error('[createAuditLog] Failed:', err.message);
  }
};

const listAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, actorId, entityType } = req.query;
    const where = {};
    if (action)     where.action      = action;
    if (actorId)    where.actor_id    = actorId;
    if (entityType) where.entity_type = entityType;

    const { count, rows } = await db.AuditLog.findAndCountAll({
      where, order: [['created_at','DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    return res.json({
      status: 'success',
      data: {
        logs: rows,
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)) },
      },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch audit logs.' });
  }
};

const getRoleHistory = async (req, res) => {
  try {
    const history = await db.RoleAssignmentHistory.findAll({
      where: { user_id: req.params.userId },
      order: [['created_at','DESC']],
    });
    return res.json({ status: 'success', data: history });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch role history.' });
  }
};

module.exports = { createAuditLog, listAuditLogs, getRoleHistory };
