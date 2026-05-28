'use strict';

const express  = require('express');
const router   = express.Router();

const { authenticate, checkPermission, isSuperAdmin, requireRole, requirePasswordReset } = require('../middleware/rbac.middleware');
const roleCtrl  = require('../controllers/role.controller');
const authCtrl     = require('../controllers/auth.controller');
const registerCtrl = require('../controllers/auth.register.controller');
const permCtrl  = require('../controllers/permission.controller');
const auditCtrl = require('../controllers/audit.controller');

const {
  authLimiter, strictAuthLimiter, apiLimiter,
  uploadLimiter, paymentLimiter, messageLimiter,
  registerLimiter, bookingLimiter,
} = require('../middleware/rateLimit.middleware');

// Global API rate limit
router.use(apiLimiter);

// ── PUBLIC ROUTES (no auth) ───────────────────────────────────────────────────
router.get('/models/public', modelCtrl.listModels);

// ── AVAILABILITY ROUTES ──────────────────────────────────────────────────────
const availCtrl = require('../controllers/availability.controller');
router.get('/models/me/availability',      authenticate, requireRole('model'), availCtrl.getMyAvailability);
router.post('/models/me/availability',     authenticate, requireRole('model'), availCtrl.setAvailability);
router.delete('/models/me/availability',   authenticate, requireRole('model'), availCtrl.clearAvailability);
router.get('/models/:id/availability',     availCtrl.getAvailability);

// ── UPLOAD ROUTES ────────────────────────────────────────────────────────────
const uploadCtrl = require('../controllers/upload.controller');

router.post('/models/me/photos/upload',           authenticate, uploadLimiter, requireRole('model'), uploadCtrl.uploadPhoto);
router.get('/models/me/photos',                   authenticate, requireRole('model'),                 uploadCtrl.getMyPhotos);
router.delete('/models/me/photos/:photoId',       authenticate, requireRole('model'),                 uploadCtrl.deletePhoto);
router.put('/models/me/photos/:photoId/primary',  authenticate, requireRole('model'),                 uploadCtrl.setPrimaryPhoto);
router.post('/admin/photos/:photoId/approve',     authenticate, checkPermission('models.approve'),    uploadCtrl.adminApprovePhoto);
router.delete('/admin/photos/:photoId',           authenticate, checkPermission('models.delete'),     uploadCtrl.adminDeletePhoto);

// ── EMAIL VERIFICATION ROUTES (public) ───────────────────────────────────────
const verifyCtrl = require('../controllers/auth.verify.controller');
router.get('/auth/verify-email',          verifyCtrl.verifyEmail);
router.post('/auth/resend-verification',  verifyCtrl.resendVerification);

// ── FORGOT PASSWORD ROUTES (public) ──────────────────────────────────────────
const forgotCtrl = require('../controllers/auth.forgot.controller');
router.post('/auth/forgot-password',        strictAuthLimiter, forgotCtrl.forgotPassword);
router.post('/auth/reset-password-link',    strictAuthLimiter, forgotCtrl.resetPasswordViaLink);
router.get('/auth/verify-reset-token',      forgotCtrl.verifyResetToken);

// ── PUBLIC routes (no token needed) ──────────────────────────────────────────
router.post('/auth/login', authLimiter,        authCtrl.login);
router.post('/auth/refresh',      authCtrl.refresh);
router.post('/auth/register', registerLimiter,     registerCtrl.register);
router.get('/auth/check-email',   registerCtrl.checkEmail);

// ── PROTECTED routes (token required from here down) ─────────────────────────
router.use(authenticate);
router.use(requirePasswordReset);

router.post('/auth/logout',          authCtrl.logout);
router.post('/auth/reset-password',  authCtrl.resetPassword);

// Current user permissions
router.get('/auth/me/permissions', (req, res) => {
  res.json({
    status: 'success',
    data: {
      userId:      req.user.id,
      roles:       req.user.roles,
      permissions: req.user.isSuperAdmin ? ['*'] : [...req.user.permissions],
      isSuperAdmin: req.user.isSuperAdmin,
    },
  });
});

// Roles
router.get('/roles',     checkPermission('roles.view'), roleCtrl.listRoles);
router.get('/roles/:id', checkPermission('roles.view'), roleCtrl.getRole);
router.post('/roles',    isSuperAdmin,                  roleCtrl.createRole);
router.put('/roles/:id', isSuperAdmin,                  roleCtrl.updateRole);
router.delete('/roles/:id', isSuperAdmin,               roleCtrl.deleteRole);
router.post('/roles/:id/permissions',   isSuperAdmin,   roleCtrl.assignPermissionsToRole);
router.delete('/roles/:id/permissions', isSuperAdmin,   roleCtrl.revokePermissionsFromRole);

// Permissions
router.get('/permissions',         checkPermission('roles.view'), permCtrl.listPermissions);
router.get('/permissions/modules', checkPermission('roles.view'), permCtrl.listModules);

// User role management
router.post('/users/:userId/roles',       requireRole('super_admin','admin'), roleCtrl.assignRoleToUser);
router.delete('/users/:userId/roles',     requireRole('super_admin','admin'), roleCtrl.revokeRoleFromUser);
router.post('/users/:userId/suspend',     requireRole('super_admin','admin'), roleCtrl.suspendUser);
router.post('/users/:userId/activate',    requireRole('super_admin','admin'), roleCtrl.activateUser);
router.post('/users/:userId/force-reset', requireRole('super_admin','admin'), roleCtrl.forcePasswordReset);

// Audit
router.get('/audit-logs',                 requireRole('super_admin','admin'), auditCtrl.listAuditLogs);
router.get('/users/:userId/role-history', requireRole('super_admin','admin'), auditCtrl.getRoleHistory);



// ── ADMIN DASHBOARD ROUTES ───────────────────────────────────────────────────
const dashCtrl = require('../controllers/dashboard.controller');

router.get('/admin/dashboard/overview',          authenticate, checkPermission('analytics.view'), dashCtrl.getOverview);
router.get('/admin/dashboard/revenue-chart',     authenticate, checkPermission('analytics.view'), dashCtrl.getRevenueChart);
router.get('/admin/dashboard/booking-stats',     authenticate, checkPermission('analytics.view'), dashCtrl.getBookingStats);
router.get('/admin/dashboard/user-stats',        authenticate, checkPermission('analytics.view'), dashCtrl.getUserStats);
router.get('/admin/dashboard/recent-activity',   authenticate, checkPermission('analytics.view'), dashCtrl.getRecentActivity);
router.get('/admin/dashboard/platform-health',   authenticate, checkPermission('analytics.view'), dashCtrl.getPlatformHealth);

// ── MESSAGING ROUTES ─────────────────────────────────────────────────────────
const msgCtrl = require('../controllers/message.controller');

router.get('/messages/unread',                    authenticate, msgCtrl.getUnreadCount);
router.get('/messages/conversations',             authenticate, msgCtrl.listConversations);
router.post('/messages/conversations',            authenticate, messageLimiter, msgCtrl.createConversation);
router.get('/messages/conversations/:id',         authenticate, msgCtrl.getConversation);
router.post('/messages/conversations/:id/reply',  authenticate, messageLimiter, msgCtrl.replyToConversation);
router.post('/messages/conversations/:id/close',  authenticate, requireRole('super_admin','admin','manager'), msgCtrl.closeConversation);

// ── PAYMENT ROUTES ───────────────────────────────────────────────────────────
const paymentCtrl = require('../controllers/payment.controller');

// Public (no auth) — Paystack webhook and callback
router.post('/payments/webhook',           paymentCtrl.webhook);
router.get('/payments/callback',           paymentCtrl.paymentCallback);

// Owner payment routes
router.post('/payments/initiate',          authenticate, paymentLimiter, requireRole('showbiz_owner'), paymentCtrl.initiatePayment);
router.get('/payments/verify',             authenticate,                                       paymentCtrl.verifyPayment);
router.get('/payments',                    authenticate, requireRole('showbiz_owner'),        paymentCtrl.listPayments);
router.get('/payments/:id',                authenticate,                                       paymentCtrl.getPayment);

// Bank utilities
router.get('/payments/banks',              authenticate, paymentCtrl.listBanks);
router.post('/payments/verify-account',    authenticate, paymentCtrl.verifyAccount);

// Admin payment routes
router.get('/admin/payments',              authenticate, checkPermission('payments.view'),    paymentCtrl.adminListPayments);
router.get('/admin/payouts',               authenticate, checkPermission('payments.view'),    paymentCtrl.adminListPayouts);
router.post('/admin/payouts/:id/process',  authenticate, checkPermission('payments.manage'), paymentCtrl.processPayout);
router.post('/admin/payments/:id/refund',  authenticate, checkPermission('payments.manage'), paymentCtrl.refundPayment);

// ── BOOKING ROUTES ────────────────────────────────────────────────────────────
const bookingCtrl = require('../controllers/booking.controller');

router.post('/bookings',             authenticate, bookingLimiter, requireRole('showbiz_owner'), bookingCtrl.createBooking);
router.get('/bookings',              authenticate, requireRole('showbiz_owner','model'), bookingCtrl.listBookings);
router.get('/bookings/:id',          authenticate,                                       bookingCtrl.getBooking);
router.post('/bookings/:id/cancel',  authenticate, requireRole('showbiz_owner'),        bookingCtrl.cancelBooking);
router.post('/bookings/:id/accept',  authenticate, requireRole('model'),                bookingCtrl.modelAcceptBooking);
router.post('/bookings/:id/decline', authenticate, requireRole('model'),                bookingCtrl.modelDeclineBooking);

router.get('/admin/bookings',                  authenticate, checkPermission('bookings.view'),    bookingCtrl.adminListBookings);
router.post('/admin/bookings/:id/approve',     authenticate, checkPermission('bookings.approve'), bookingCtrl.adminApproveBooking);
router.post('/admin/bookings/:id/reject',      authenticate, checkPermission('bookings.approve'), bookingCtrl.adminRejectBooking);
router.post('/admin/bookings/:id/complete',    authenticate, checkPermission('bookings.edit'),    bookingCtrl.completeBooking);

// ── MODEL ROUTES ──────────────────────────────────────────────────────────────
const modelCtrl = require('../controllers/model.controller');

// Public
router.get('/models',                       modelCtrl.listModels);
router.get('/models/:id',                   modelCtrl.getModel);

// Model (own profile)
router.get('/models/me/profile',            authenticate, requireRole('model'), modelCtrl.getMyProfile);
router.put('/models/me/profile',            authenticate, requireRole('model'), modelCtrl.updateMyProfile);
router.post('/models/me/photos',            authenticate, requireRole('model'), modelCtrl.addPhoto);
router.delete('/models/me/photos/:photoId', authenticate, requireRole('model'), modelCtrl.deletePhoto);

// Admin
router.get('/admin/models',                         authenticate, checkPermission('models.view'),    modelCtrl.adminListModels);
router.post('/admin/models/:id/approve',            authenticate, checkPermission('models.approve'), modelCtrl.approveModel);
router.post('/admin/models/:id/reject',             authenticate, checkPermission('models.approve'), modelCtrl.rejectModel);
router.post('/admin/models/:id/feature',            authenticate, checkPermission('models.edit'),    modelCtrl.featureModel);
router.post('/admin/models/photos/:photoId/approve',authenticate, checkPermission('models.approve'), modelCtrl.approvePhoto);

// Health
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
