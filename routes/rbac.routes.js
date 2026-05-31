'use strict';

const express  = require('express');
const router   = express.Router();

const { authenticate, checkPermission, isSuperAdmin, requireRole, requirePasswordReset, optionalAuth } = require('../middleware/rbac.middleware');
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

// ── AVAILABILITY ROUTES ──────────────────────────────────────────────────────
const availCtrl = require('../controllers/availability.controller');
router.get('/models/me/availability',      authenticate, requireRole('model'), availCtrl.getMyAvailability);
router.post('/models/me/availability',     authenticate, requireRole('model'), availCtrl.setAvailability);
router.delete('/models/me/availability',   authenticate, requireRole('model'), availCtrl.clearAvailability);
router.get('/models/:id/availability',     availCtrl.getAvailability);


// ── KYC ROUTES ────────────────────────────────────────────────────────────────
const kycCtrl = require('../controllers/kyc.controller');
router.get('/kyc/me',                    authenticate, kycCtrl.getMyKYC);
router.post('/kyc/submit',               authenticate, kycCtrl.submitKYC);
router.get('/admin/kyc',                 authenticate, checkPermission('users.manage'), kycCtrl.adminListKYC);
router.get('/admin/kyc/:id',             authenticate, checkPermission('users.manage'), kycCtrl.adminGetKYC);
router.post('/admin/kyc/:id/approve',    authenticate, checkPermission('users.manage'), kycCtrl.adminApproveKYC);
router.post('/admin/kyc/:id/reject',     authenticate, checkPermission('users.manage'), kycCtrl.adminRejectKYC);

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


// ── PUBLIC CONTACT FORM ───────────────────────────────────────────────────────
const contactCtrl = require('../controllers/contact.controller');
router.post('/contact', contactCtrl.submitContact);








// ── REVIEW ROUTES ─────────────────────────────────────────────────────────────
const reviewCtrl = require('../controllers/review.controller');
router.post('/reviews',                      authenticate, requireRole('showbiz_owner'), reviewCtrl.createReview);
router.get('/reviews/model/:modelId',        reviewCtrl.getModelReviews);
router.get('/reviews/booking/:bookingId',    authenticate, reviewCtrl.getBookingReview);
router.get('/admin/reviews',                 authenticate, checkPermission('users.manage'), reviewCtrl.adminListReviews);
router.put('/admin/reviews/:id/toggle',      authenticate, checkPermission('users.manage'), reviewCtrl.adminToggleReview);

// ── PUSH NOTIFICATION ROUTES ──────────────────────────────────────────────────
const pushCtrl = require('../controllers/push.controller');
router.get('/push/vapid-key',        pushCtrl.getVapidKey);
router.post('/push/subscribe',       authenticate, pushCtrl.subscribe);
router.delete('/push/unsubscribe',   authenticate, pushCtrl.unsubscribe);
router.post('/admin/push/broadcast', authenticate, checkPermission('users.manage'), pushCtrl.adminBroadcast);

// ── EXPORT ROUTES ─────────────────────────────────────────────────────────────
const exportCtrl = require('../controllers/export.controller');
router.get('/admin/export/bookings',  authenticate, checkPermission('bookings.view'),  exportCtrl.exportBookings);
router.get('/admin/export/payments',  authenticate, checkPermission('payments.view'),  exportCtrl.exportPayments);
router.get('/admin/export/users',     authenticate, checkPermission('users.view'),     exportCtrl.exportUsers);
router.get('/admin/export/kyc',       authenticate, checkPermission('users.manage'),   exportCtrl.exportKYC);
router.get('/admin/export/contacts',  authenticate, checkPermission('users.manage'),   exportCtrl.exportContacts);

// ── SETTINGS ROUTES ───────────────────────────────────────────────────────────
const settingsCtrl = require('../controllers/settings.controller');
router.get('/settings/public',          settingsCtrl.publicSettings);
router.get('/admin/settings',           authenticate, checkPermission('users.manage'), settingsCtrl.listSettings);
router.put('/admin/settings/bulk',      authenticate, checkPermission('users.manage'), settingsCtrl.bulkUpdate);
router.put('/admin/settings/:key',      authenticate, checkPermission('users.manage'), settingsCtrl.updateSetting);

// ── BANK TRANSFER ROUTES ──────────────────────────────────────────────────────
const bankCtrl = require('../controllers/bank_transfer.controller');
router.post('/bank-transfers',                    authenticate, bankCtrl.submitTransfer);
router.get('/bank-transfers/me',                  authenticate, bankCtrl.getMyTransfers);
router.get('/admin/bank-transfers',               authenticate, checkPermission('payments.view'), bankCtrl.adminList);
router.post('/admin/bank-transfers/:id/confirm',  authenticate, checkPermission('payments.manage'), bankCtrl.adminConfirm);
router.post('/admin/bank-transfers/:id/reject',   authenticate, checkPermission('payments.manage'), bankCtrl.adminReject);

// ── WALLET ROUTES ─────────────────────────────────────────────────────────────
const walletCtrl = require('../controllers/wallet.controller');
router.get('/wallet',                          authenticate, walletCtrl.getWallet);
router.get('/wallet/transactions',             authenticate, walletCtrl.getTransactions);
router.post('/wallet/fund',                    authenticate, walletCtrl.initiateFunding);
router.get('/wallet/verify/:reference',        authenticate, walletCtrl.verifyFunding);
router.get('/admin/wallets',                   authenticate, checkPermission('payments.view'), walletCtrl.adminListWallets);
router.post('/admin/wallets/:userId/credit',   authenticate, checkPermission('payments.manage'), walletCtrl.adminCredit);
router.post('/admin/wallets/:userId/debit',    authenticate, checkPermission('payments.manage'), walletCtrl.adminDebit);

// ── ANNOUNCEMENT ROUTES ───────────────────────────────────────────────────────
const annCtrl = require('../controllers/announcement.controller');
router.get('/announcements',              authenticate, annCtrl.listAnnouncements);
router.get('/admin/announcements',        authenticate, checkPermission('users.manage'), annCtrl.adminList);
router.post('/admin/announcements',       authenticate, checkPermission('users.manage'), annCtrl.adminCreate);
router.put('/admin/announcements/:id',    authenticate, checkPermission('users.manage'), annCtrl.adminUpdate);
router.delete('/admin/announcements/:id', authenticate, checkPermission('users.manage'), annCtrl.adminDelete);

// ── REPORT & FEEDBACK ROUTES ──────────────────────────────────────────────────
const withdrawalCtrl = require('../controllers/withdrawal.controller');
const reportCtrl = require('../controllers/report.controller');
router.post('/reports',              authenticate, reportCtrl.createReport);
router.get('/reports/me',            authenticate, reportCtrl.getMyReports);
router.get('/reports/:id',           authenticate, reportCtrl.getReport);
router.get('/admin/reports',         authenticate, checkPermission('users.manage'), reportCtrl.adminListReports);
router.get('/admin/reports/:id',     authenticate, checkPermission('users.manage'), reportCtrl.adminGetReport);
router.post('/admin/reports/:id/reply',  authenticate, checkPermission('users.manage'), reportCtrl.adminReplyReport);
router.put('/admin/reports/:id/status',  authenticate, checkPermission('users.manage'), reportCtrl.adminUpdateStatus);

// ── ADMIN CONTACT ROUTES ─────────────────────────────────────────────────────
router.get('/admin/contact',        authenticate, checkPermission('users.manage'), contactCtrl.listContacts);
router.get('/admin/contact/:id',    authenticate, checkPermission('users.manage'), contactCtrl.getContact);
router.put('/admin/contact/:id',    authenticate, checkPermission('users.manage'), contactCtrl.updateContact);
router.delete('/admin/contact/:id', authenticate, checkPermission('users.manage'), contactCtrl.deleteContact);

// ── PUBLIC MODEL ROUTES (no auth needed) ─────────────────────────────────────
const modelCtrlPublic = require('../controllers/model.controller');
router.get('/models/public', optionalAuth, modelCtrlPublic.listModels);

// ── PROTECTED routes (token required from here down) ─────────────────────────
router.use(authenticate);
router.use(requirePasswordReset);

router.post('/auth/change-password', authenticate, authCtrl.changePassword);
const sessionCtrl = require('../controllers/session.controller');
router.get('/auth/sessions',          authenticate, sessionCtrl.listSessions);
router.delete('/auth/sessions/:id',   authenticate, sessionCtrl.revokeSession);
router.delete('/auth/sessions',       authenticate, sessionCtrl.revokeAllSessions);
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
router.get('/admin/users', authenticate, checkPermission('users.manage'), async (req, res) => {
  try {
    const db = require('../models');
    const { page = 1, limit = 20, search, role } = req.query;
    const { Op } = require('sequelize');
    const where = {};
    if (search) where[Op.or] = [
      { first_name: { [Op.iLike]: '%' + search + '%' } },
      { last_name:  { [Op.iLike]: '%' + search + '%' } },
      { email:      { [Op.iLike]: '%' + search + '%' } },
    ];
    // Role filter via include
    const roleWhere = role ? { name: role } : {};
    const { count, rows } = await db.User.findAndCountAll({
      where,
      include: [{ model: db.Role, as: 'roles', through: { attributes: [] }, attributes: ['name', 'display_name'], where: Object.keys(roleWhere).length ? roleWhere : undefined, required: !!role }],
      attributes: ['id','first_name','last_name','email','is_active','is_suspended','kyc_verified','created_at'],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });
    return res.json({ status: 'success', data: { users: rows, total: count } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

router.post('/users/:userId/unsuspend', authenticate, checkPermission('users.manage'), roleCtrl.unsuspendUser);
router.post('/users/:userId/suspend',     requireRole('super_admin','admin'), roleCtrl.suspendUser);
router.post('/users/:userId/activate',    requireRole('super_admin','admin'), roleCtrl.activateUser);
router.post('/users/:userId/verify-email', authenticate, requireRole('super_admin','admin'), async (req, res) => {
  try {
    const db = require('../models');
    await db.User.update({ email_verified: true }, { where: { id: req.params.userId } });
    return res.json({ status: 'success', message: 'Email verified.' });
  } catch (err) { return res.status(500).json({ status: 'error', message: err.message }); }
});
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
router.delete('/messages/:messageId',              authenticate, msgCtrl.deleteMessage);
router.post('/messages/admin/initiate',           authenticate, requireRole('super_admin','admin','manager','moderator'), msgCtrl.adminInitiateConversation);
router.post('/messages/conversations/:id/close',  authenticate, msgCtrl.closeConversation);

// ── PAYMENT ROUTES ───────────────────────────────────────────────────────────
const paymentCtrl = require('../controllers/payment.controller');

// Public (no auth) — Paystack webhook and callback
router.post('/payments/webhook',           paymentCtrl.paystackWebhook);
// paymentCallback removed - wallet-based payments don't need callback

// Owner payment routes
router.get('/payments/banks', authenticate, async (req, res) => res.json({ status: 'success', data: [] }));
router.post('/payments/complete-booking/:bookingId', authenticate, checkPermission('bookings.manage'), paymentCtrl.completeBookingPayment);
router.post('/payments/initiate',          authenticate, paymentLimiter, requireRole('showbiz_owner'), paymentCtrl.initiatePayment);
// verifyPayment removed - wallet-based payments verified instantly
router.get('/payments',                    authenticate, requireRole('showbiz_owner'),        paymentCtrl.listPayments);


// Admin payment routes
router.get('/admin/payouts', authenticate, checkPermission('payments.view'), async (req, res) => res.json({ status: 'success', data: { payouts: [] } }));
router.get('/admin/payments',              authenticate, checkPermission('payments.view'),    paymentCtrl.adminListPayments);

// ── 2FA ROUTES
const twofaCtrl = require('../controllers/twofa.controller');
router.get('/auth/2fa/status',   authenticate, twofaCtrl.get2FAStatus);
router.get('/auth/2fa/setup',    authenticate, twofaCtrl.setup2FA);
router.post('/auth/2fa/enable',  authenticate, twofaCtrl.enable2FA);
router.post('/auth/2fa/disable', authenticate, twofaCtrl.disable2FA);
router.post('/auth/2fa/verify',               twofaCtrl.verify2FA);

// ── MODEL VIDEO ROUTES
const { uploadIntroVideo, deleteIntroVideo, approveIntroVideo, rejectIntroVideo } = require('../controllers/model.controller');
const multer        = require('multer');
const cloudinaryMod = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const videoStorage  = new CloudinaryStorage({ cloudinary: cloudinaryMod, params: { folder: 'showbiz/videos', resource_type: 'video', allowed_formats: ['mp4','mov','avi','webm'], transformation: [{ quality: 'auto' }] } });
const videoUpload   = multer({ storage: videoStorage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

router.post('/models/me/video',              authenticate, requireRole('model'), videoUpload.single('video'), uploadIntroVideo);
router.delete('/models/me/video',            authenticate, requireRole('model'),                               deleteIntroVideo);
router.post('/admin/models/:id/video/approve', authenticate, checkPermission('models.manage'),                approveIntroVideo);
router.post('/admin/models/:id/video/reject',  authenticate, checkPermission('models.manage'),                rejectIntroVideo);

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
const modelCtrl = modelCtrlPublic; // same module

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
router.get('/admin/models/:id/photos',             authenticate, checkPermission('models.view'),    modelCtrl.adminGetModelPhotos);

// Health
router.get('/health', (req, res) => res.json({ status: 'ok' }));

// Withdrawal routes
router.post('/withdrawals',                    authenticate, requireRole('model'), withdrawalCtrl.createWithdrawal);
router.get('/withdrawals',                     authenticate, requireRole('model'), withdrawalCtrl.listWithdrawals);
router.get('/admin/withdrawals',               authenticate, checkPermission('users.manage'), withdrawalCtrl.adminListWithdrawals);
router.post('/admin/withdrawals/:id/approve',  authenticate, checkPermission('users.manage'), withdrawalCtrl.approveWithdrawal);
router.post('/admin/withdrawals/:id/reject',   authenticate, checkPermission('users.manage'), withdrawalCtrl.rejectWithdrawal);
router.post('/admin/withdrawals/:id/complete', authenticate, checkPermission('users.manage'), withdrawalCtrl.completeWithdrawal);

// Super Admin impersonation
router.post('/admin/impersonate/:userId', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const db = require('../models');
    const jwt = require('jsonwebtoken');
    const target = await db.User.findByPk(req.params.userId, {
      include: [{ model: db.Role, as: 'roles', through: { attributes: [] } }]
    });
    if (!target) return res.status(404).json({ status: 'error', message: 'User not found.' });

    // Prevent impersonating another super admin
    const targetRoles = target.roles.map(r => r.name);
    if (targetRoles.includes('super_admin'))
      return res.status(403).json({ status: 'error', message: 'Cannot impersonate Super Admin.' });

    // Generate token for target user
    const token = jwt.sign(
      { userId: target.id, impersonatedBy: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Audit log
    try {
      await db.AuditLog.create({
        id: require('uuid').v4(),
        actor_id: req.user.id,
        actor_role: 'super_admin',
        action: 'user.impersonated',
        entity_type: 'User',
        entity_id: target.id,
        ip_address: req.ip,
        new_values: { target_email: target.email, target_roles: targetRoles },
      });
    } catch {}

    return res.json({
      status: 'success',
      message: `Now impersonating ${target.first_name} ${target.last_name}`,
      data: {
        token,
        user: {
          id: target.id,
          first_name: target.first_name,
          last_name: target.last_name,
          email: target.email,
          roles: targetRoles,
        }
      }
    });
  } catch (err) {
    console.error('[impersonate]', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
