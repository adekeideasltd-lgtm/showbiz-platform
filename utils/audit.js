/**
 * SHOWBIZ PLATFORM — Audit Log Utility + Controller
 *
 * createAuditLog()  → called internally by every controller action
 * listAuditLogs()   → paginated list for Super Admin dashboard
 * getRoleHistory()  → role assignment history for a specific user
 */

'use strict';

const db = require('../models');

// ─── Utility: write an audit entry ───────────────────────────────────────────
const createAuditLog = async ({
  actorId,
  actorRole,
  action,
  entityType,
  entityId = null,
  oldValue = null,
  newValue = null,
  ipAddress = null,
  userAgent = null,
}) => {
  try {
    await db.AuditLog.create({
      actor_id:    actorId,
      actor_role:  actorRole,
      action,
      entity_type: entityType,
      entity_id:   entityId,
      old_value:   oldValue,
      new_value:   newValue,
      ip_address:  ipAddress,
      user_agent:  userAgent,
    });
  } catch (err) {
    // Audit log failure must never crash the main flow
    console.error('[createAuditLog] Failed to write audit entry:', err.message);
  }
};

// ─── Controller: GET /api/audit-logs ─────────────────────────────────────────
const listAuditLogs = async (req, res) => {
  try {
    const {
      page     = 1,
      limit    = 50,
      action,
      actorId,
      entityType,
      from,
      to,
    } = req.query;

    const where = {};
    if (action)     where.action      = action;
    if (actorId)    where.actor_id    = actorId;
    if (entityType) where.entity_type = entityType;

    if (from || to) {
      const { Op } = require('sequelize');
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to)   where.created_at[Op.lte] = new Date(to);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await db.AuditLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit:  parseInt(limit),
      offset,
      include: [{
        model: db.User,
        as: 'actor',
        attributes: ['id', 'first_name', 'last_name', 'email'],
      }],
    });

    return res.json({
      status: 'success',
      data: {
        logs: rows,
        pagination: {
          total: count,
          page:  parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    console.error('[listAuditLogs]', err);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch audit logs.' });
  }
};

// ─── Controller: GET /api/users/:userId/role-history ─────────────────────────
const getRoleHistory = async (req, res) => {
  try {
    const history = await db.RoleAssignmentHistory.findAll({
      where: { user_id: req.params.userId },
      order: [['created_at', 'DESC']],
      include: [
        { model: db.Role, as: 'role', attributes: ['id', 'name', 'display_name'] },
        {
          model: db.User,
          as: 'performer',
          attributes: ['id', 'first_name', 'last_name', 'email'],
          foreignKey: 'performed_by',
        },
      ],
    });

    return res.json({ status: 'success', data: history });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch role history.' });
  }
};

module.exports = { createAuditLog, listAuditLogs, getRoleHistory };
