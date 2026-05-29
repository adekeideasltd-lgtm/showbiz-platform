'use strict';

const jwt = require('jsonwebtoken');
const db  = require('../models');
const { createAuditLog } = require('../controllers/audit.controller');

const JWT_SECRET = process.env.JWT_SECRET;

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', code: 'AUTH_TOKEN_MISSING', message: 'Authentication token is required.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        status: 'error',
        code: err.name === 'TokenExpiredError' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
        message: 'Invalid or expired token. Please log in again.',
      });
    }

    // Step 1 — find the user (no joins, simple and fast)
    const user = await db.User.findOne({
      where: { id: decoded.userId, is_active: true, is_suspended: false },
    });

    if (!user) {
      return res.status(401).json({ status: 'error', code: 'AUTH_USER_NOT_FOUND', message: 'Account not found or suspended.' });
    }

    // Step 2 — load roles separately (avoids the broken JOIN condition)
    const roles = await user.getRoles({
      include: [{
        model: db.Permission,
        as: 'permissions',
        through: { attributes: [] },
      }],
    });

    // Step 3 — build permission set
    const permissionSet = new Set();
    const roleNames = [];

    for (const role of roles) {
      roleNames.push(role.name);
      if (role.name === 'super_admin') {
        permissionSet.add('*');
        break;
      }
      for (const perm of role.permissions) {
        permissionSet.add(perm.name);
      }
    }

    req.user = {
      id:                 user.id,
      email:              user.email,
      firstName:          user.first_name,
      roles:              roleNames,
      permissions:        permissionSet,
      isSuperAdmin:       roleNames.includes('super_admin'),
      forcePasswordReset: user.force_password_reset,
    };

    next();
  } catch (err) {
    console.error('[authenticate] ERROR:', err.message);
    return res.status(500).json({ status: 'error', message: 'Authentication failed.' });
  }
};

const checkPermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'Unauthenticated.' });
  if (req.user.isSuperAdmin || req.user.permissions.has('*')) return next();
  if (!req.user.permissions.has(permission)) {
    return res.status(403).json({ status: 'error', code: 'PERMISSION_DENIED', message: 'Missing permission: ' + permission });
  }
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'Unauthenticated.' });
  if (req.user.isSuperAdmin) return next();
  if (!req.user.roles.some(r => roles.includes(r))) {
    return res.status(403).json({ status: 'error', code: 'ROLE_DENIED', message: 'Access restricted to: ' + roles.join(', ') });
  }
  next();
};

const isSuperAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'Unauthenticated.' });
  if (!req.user.isSuperAdmin) return res.status(403).json({ status: 'error', code: 'SUPER_ADMIN_ONLY', message: 'Requires Super Admin.' });
  next();
};

const ownResourceGuard = (paramKey = 'userId') => (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'Unauthenticated.' });
  const elevated = ['super_admin', 'admin', 'manager', 'moderator'];
  if (req.user.roles.some(r => elevated.includes(r))) return next();
  if (req.params[paramKey] !== req.user.id) {
    return res.status(403).json({ status: 'error', code: 'NOT_YOUR_RESOURCE', message: 'You can only access your own resources.' });
  }
  next();
};

const requirePasswordReset = (req, res, next) => {
  if (req.path.includes('/auth/reset-password')) return next();
  if (req.user && req.user.forcePasswordReset) {
    return res.status(403).json({ status: 'error', code: 'FORCE_PASSWORD_RESET', message: 'You must change your password before continuing.' });
  }
  next();
};

module.exports = { authenticate, checkPermission, requireRole, isSuperAdmin, ownResourceGuard, requirePasswordReset };
// ── Optional auth — attaches user if token present, does not block ────────────
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) return next();
    const token = header.split(' ')[1];
    const jwt   = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = require('../models');
    const user = await db.User.findByPk(decoded.id);
    if (user) {
      req.user = {
        id: user.id, email: user.email,
        isSuperAdmin: user.is_super_admin,
        roles: decoded.roles || [],
      };
    }
  } catch {}
  next();
};

module.exports.optionalAuth = optionalAuth;
