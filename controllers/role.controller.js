/**
 * SHOWBIZ PLATFORM — Role Management Controller
 *
 * Super Admin capabilities:
 *   GET    /api/roles               → list all roles
 *   POST   /api/roles               → create new role
 *   PUT    /api/roles/:id           → update role
 *   DELETE /api/roles/:id           → delete non-system role
 *   GET    /api/roles/:id/permissions  → list role permissions
 *   POST   /api/roles/:id/permissions  → assign permissions to role
 *   DELETE /api/roles/:id/permissions  → revoke permissions from role
 *   POST   /api/users/:userId/roles → assign role to user
 *   DELETE /api/users/:userId/roles → revoke role from user
 *   POST   /api/users/:userId/suspend  → suspend user
 *   POST   /api/users/:userId/activate → activate user
 *   POST   /api/users/:userId/force-reset → force password reset
 */

'use strict';

const { Op }    = require('sequelize');
const db        = require('../models');
const { createAuditLog } = require('../utils/audit');

// ─────────────────────────────────────────────────────────────────────────────
// ROLES — CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/roles */
const listRoles = async (req, res) => {
  try {
    const roles = await db.Role.findAll({
      include: [{
        model: db.Permission,
        as: 'permissions',
        through: { attributes: [] },
        attributes: ['id', 'name', 'display_name', 'module', 'action'],
      }],
      order: [['display_name', 'ASC']],
    });
    return res.json({ status: 'success', data: roles });
  } catch (err) {
    console.error('[listRoles]', err);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch roles.' });
  }
};

/** GET /api/roles/:id */
const getRole = async (req, res) => {
  try {
    const role = await db.Role.findByPk(req.params.id, {
      include: [{ model: db.Permission, as: 'permissions', through: { attributes: [] } }],
    });
    if (!role) return res.status(404).json({ status: 'error', message: 'Role not found.' });
    return res.json({ status: 'success', data: role });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch role.' });
  }
};

/** POST /api/roles */
const createRole = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { name, display_name, description, permissions = [] } = req.body;

    if (!name || !display_name) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'name and display_name are required.' });
    }

    const exists = await db.Role.findOne({ where: { name } });
    if (exists) {
      await t.rollback();
      return res.status(409).json({ status: 'error', message: `Role "${name}" already exists.` });
    }

    const role = await db.Role.create({
      name,
      display_name,
      description,
      guard_name: 'api',
      is_system: false,
      is_active: true,
      created_by: req.user.id,
    }, { transaction: t });

    // Assign permissions if provided
    if (permissions.length > 0) {
      const permRecords = await db.Permission.findAll({
        where: { name: { [Op.in]: permissions } },
        transaction: t,
      });
      await role.addPermissions(permRecords, {
        transaction: t,
        through: { granted_by: req.user.id },
      });
    }

    await t.commit();

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'role.created',
      entityType: 'Role',
      entityId: role.id,
      newValue: { name, display_name, permissions },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(201).json({ status: 'success', message: 'Role created.', data: role });
  } catch (err) {
    await t.rollback();
    console.error('[createRole]', err);
    return res.status(500).json({ status: 'error', message: 'Failed to create role.' });
  }
};

/** PUT /api/roles/:id */
const updateRole = async (req, res) => {
  try {
    const role = await db.Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ status: 'error', message: 'Role not found.' });

    if (role.is_system && role.name === 'super_admin') {
      return res.status(403).json({
        status: 'error',
        message: 'The Super Admin role cannot be modified.',
      });
    }

    const oldValue = { display_name: role.display_name, description: role.description };
    const { display_name, description, is_active } = req.body;

    await role.update({ display_name, description, is_active });

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'role.updated',
      entityType: 'Role',
      entityId: role.id,
      oldValue,
      newValue: req.body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: 'Role updated.', data: role });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to update role.' });
  }
};

/** DELETE /api/roles/:id */
const deleteRole = async (req, res) => {
  try {
    const role = await db.Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ status: 'error', message: 'Role not found.' });

    if (role.is_system) {
      return res.status(403).json({
        status: 'error',
        message: 'System roles cannot be deleted. You may deactivate them instead.',
      });
    }

    await role.destroy();

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'role.deleted',
      entityType: 'Role',
      entityId: role.id,
      oldValue: { name: role.name },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: 'Role deleted.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to delete role.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION ASSIGNMENT
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/roles/:id/permissions */
const assignPermissionsToRole = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { permissions } = req.body; // array of permission names
    if (!Array.isArray(permissions) || permissions.length === 0) {
      await t.rollback();
      return res.status(400).json({ status: 'error', message: 'permissions array is required.' });
    }

    const role = await db.Role.findByPk(req.params.id, { transaction: t });
    if (!role) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Role not found.' }); }

    const permRecords = await db.Permission.findAll({
      where: { name: { [Op.in]: permissions } },
      transaction: t,
    });

    await role.addPermissions(permRecords, {
      transaction: t,
      through: { granted_by: req.user.id },
      ignoreDuplicates: true,
    });

    await t.commit();

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'role.permissions.assigned',
      entityType: 'Role',
      entityId: role.id,
      newValue: { permissions },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: `${permRecords.length} permission(s) assigned.` });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to assign permissions.' });
  }
};

/** DELETE /api/roles/:id/permissions */
const revokePermissionsFromRole = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { permissions } = req.body;
    const role = await db.Role.findByPk(req.params.id, { transaction: t });
    if (!role) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Role not found.' }); }

    const permRecords = await db.Permission.findAll({
      where: { name: { [Op.in]: permissions } },
      transaction: t,
    });

    await role.removePermissions(permRecords, { transaction: t });
    await t.commit();

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'role.permissions.revoked',
      entityType: 'Role',
      entityId: role.id,
      oldValue: { permissions },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: 'Permissions revoked.' });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to revoke permissions.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USER ROLE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/users/:userId/roles  — body: { role, expiresAt? } */
const assignRoleToUser = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { role: roleName, expiresAt } = req.body;
    const { userId } = req.params;

    const [user, role] = await Promise.all([
      db.User.findByPk(userId, { transaction: t }),
      db.Role.findOne({ where: { name: roleName }, transaction: t }),
    ]);

    if (!user) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'User not found.' }); }
    if (!role)  { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Role not found.' }); }

    // Only Super Admin can assign super_admin role
    if (role.name === 'super_admin' && !req.user.isSuperAdmin) {
      await t.rollback();
      return res.status(403).json({ status: 'error', message: 'Only Super Admin can assign the Super Admin role.' });
    }

    await db.UserRole.findOrCreate({
      where: { user_id: userId, role_id: role.id },
      defaults: {
        assigned_by: req.user.id,
        expires_at: expiresAt || null,
      },
      transaction: t,
    });

    // Record assignment history
    await db.RoleAssignmentHistory.create({
      user_id: userId,
      role_id: role.id,
      action: 'assigned',
      performed_by: req.user.id,
      reason: req.body.reason || null,
    }, { transaction: t });

    await t.commit();

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'user.role.assigned',
      entityType: 'User',
      entityId: userId,
      newValue: { role: roleName, expiresAt },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: `Role "${roleName}" assigned to user.` });
  } catch (err) {
    await t.rollback();
    console.error('[assignRoleToUser]', err);
    return res.status(500).json({ status: 'error', message: 'Failed to assign role.' });
  }
};

/** DELETE /api/users/:userId/roles  — body: { role } */
const revokeRoleFromUser = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { role: roleName } = req.body;
    const { userId } = req.params;

    const role = await db.Role.findOne({ where: { name: roleName }, transaction: t });
    if (!role) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Role not found.' }); }

    // Prevent revoking own Super Admin role
    if (role.name === 'super_admin' && userId === req.user.id) {
      await t.rollback();
      return res.status(403).json({ status: 'error', message: 'You cannot revoke your own Super Admin role.' });
    }

    await db.UserRole.destroy({ where: { user_id: userId, role_id: role.id }, transaction: t });

    await db.RoleAssignmentHistory.create({
      user_id: userId,
      role_id: role.id,
      action: 'revoked',
      performed_by: req.user.id,
      reason: req.body.reason || null,
    }, { transaction: t });

    await t.commit();

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'user.role.revoked',
      entityType: 'User',
      entityId: userId,
      oldValue: { role: roleName },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: `Role "${roleName}" revoked from user.` });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to revoke role.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// USER ACCOUNT ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/users/:userId/suspend */
const suspendUser = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await db.User.findByPk(req.params.userId);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    // Prevent suspending another Super Admin
    const userRoles = await user.getRoles();
    if (userRoles.some(r => r.name === 'super_admin')) {
      return res.status(403).json({ status: 'error', message: 'A Super Admin account cannot be suspended.' });
    }

    await user.update({
      is_suspended: true,
      suspended_reason: reason || 'Suspended by administrator',
      suspended_by: req.user.id,
    });

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'user.suspended',
      entityType: 'User',
      entityId: user.id,
      newValue: { reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: 'User suspended.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to suspend user.' });
  }
};

/** POST /api/users/:userId/activate */
const activateUser = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.params.userId);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    await user.update({ is_suspended: false, suspended_reason: null, suspended_by: null });

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'user.activated',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: 'User activated.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to activate user.' });
  }
};

/** POST /api/users/:userId/force-reset */
const forcePasswordReset = async (req, res) => {
  try {
    const user = await db.User.findByPk(req.params.userId);
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    await user.update({ force_password_reset: true });

    await createAuditLog({
      actorId: req.user.id,
      actorRole: req.user.roles[0],
      action: 'user.force_password_reset',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.json({ status: 'success', message: 'Password reset flag set. User must reset on next login.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to set password reset flag.' });
  }
};

module.exports = {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  assignPermissionsToRole,
  revokePermissionsFromRole,
  assignRoleToUser,
  revokeRoleFromUser,
  suspendUser,
  activateUser,
  forcePasswordReset,
};
