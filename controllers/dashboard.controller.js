'use strict';

const { Op } = require('sequelize');
const db      = require('../models');

// ── Helper: date range builder ────────────────────────────────────────────────
const getDateRange = (period) => {
  const now   = new Date();
  const start = new Date();

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    default:
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
  }

  return { start, end: now };
};

// ── GET /api/admin/dashboard/overview ─────────────────────────────────────────
const getOverview = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const { start, end } = getDateRange(period);
    const dateFilter = { created_at: { [Op.between]: [start, end] } };

    // Run all counts in parallel
    const [
      totalUsers,
      newUsers,
      totalModels,
      pendingModels,
      approvedModels,
      totalBookings,
      newBookings,
      confirmedBookings,
      completedBookings,
      totalRevenue,
      periodRevenue,
      pendingPayouts,
      openConversations,
    ] = await Promise.all([
      db.User.count(),
      db.User.count({ where: dateFilter }),
      db.ModelProfile.count(),
      db.ModelProfile.count({ where: { status: 'pending' } }),
      db.ModelProfile.count({ where: { status: 'approved' } }),
      db.Booking.count(),
      db.Booking.count({ where: dateFilter }),
      db.Booking.count({ where: { status: 'confirmed' } }),
      db.Booking.count({ where: { status: 'completed' } }),
      db.Payment.sum('amount',            { where: { status: 'success' } }),
      db.Payment.sum('amount',            { where: { status: 'success', ...dateFilter } }),
      db.Payout.sum('amount',             { where: { status: 'pending' } }),
      db.Conversation.count({ where: { status: 'open' } }),
    ]);

    const totalCommission = await db.Payment.sum('commission_amount', { where: { status: 'success' } });
    const periodCommission = await db.Payment.sum('commission_amount', { where: { status: 'success', ...dateFilter } });

    return res.json({
      status: 'success',
      data: {
        period,
        users: {
          total:    totalUsers    || 0,
          new:      newUsers      || 0,
        },
        models: {
          total:    totalModels   || 0,
          pending:  pendingModels || 0,
          approved: approvedModels|| 0,
        },
        bookings: {
          total:     totalBookings     || 0,
          new:       newBookings       || 0,
          confirmed: confirmedBookings || 0,
          completed: completedBookings || 0,
        },
        revenue: {
          total_all_time:   parseFloat(totalRevenue    || 0).toFixed(2),
          total_period:     parseFloat(periodRevenue   || 0).toFixed(2),
          commission_all:   parseFloat(totalCommission || 0).toFixed(2),
          commission_period:parseFloat(periodCommission|| 0).toFixed(2),
          pending_payouts:  parseFloat(pendingPayouts  || 0).toFixed(2),
        },
        messages: {
          open_conversations: openConversations || 0,
        },
      },
    });
  } catch (err) {
    console.error('[getOverview]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch overview.' });
  }
};

// ── GET /api/admin/dashboard/revenue-chart ────────────────────────────────────
const getRevenueChart = async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const results = [];

    for (let i = parseInt(months) - 1; i >= 0; i--) {
      const date  = new Date();
      date.setMonth(date.getMonth() - i);
      const year  = date.getFullYear();
      const month = date.getMonth();

      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 0, 23, 59, 59);

      const [revenue, commission, bookings] = await Promise.all([
        db.Payment.sum('amount', { where: { status: 'success', created_at: { [Op.between]: [start, end] } } }),
        db.Payment.sum('commission_amount', { where: { status: 'success', created_at: { [Op.between]: [start, end] } } }),
        db.Booking.count({ where: { created_at: { [Op.between]: [start, end] } } }),
      ]);

      results.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        year,
        month_number: month + 1,
        revenue:    parseFloat(revenue    || 0).toFixed(2),
        commission: parseFloat(commission || 0).toFixed(2),
        bookings:   bookings || 0,
      });
    }

    return res.json({ status: 'success', data: results });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch revenue chart.' });
  }
};

// ── GET /api/admin/dashboard/booking-stats ────────────────────────────────────
const getBookingStats = async (req, res) => {
  try {
    const statuses = ['pending','model_review','confirmed','rejected_by_admin','rejected_by_model','cancelled','completed'];

    const counts = await Promise.all(
      statuses.map(async (status) => ({
        status,
        count: await db.Booking.count({ where: { status } }),
      }))
    );

    // Top models by booking count
    const topModels = await db.Booking.findAll({
      attributes: [
        'model_id',
        [db.sequelize.fn('COUNT', db.sequelize.col('Booking.id')), 'booking_count'],
        [db.sequelize.fn('SUM', db.sequelize.col('total_amount')), 'total_earned'],
      ],
      where: { status: ['confirmed','completed'] },
      group:  ['model_id', 'model.id', 'model->user.id'],
      order:  [[db.sequelize.fn('COUNT', db.sequelize.col('Booking.id')), 'DESC']],
      limit:  5,
      include: [{
        model: db.ModelProfile,
        as:    'model',
        attributes: ['id'],
        include: [{ model: db.User, as: 'user', attributes: ['first_name','last_name'] }],
      }],
    });

    // Top owners by spend
    const topOwners = await db.Booking.findAll({
      attributes: [
        'owner_id',
        [db.sequelize.fn('COUNT', db.sequelize.col('Booking.id')), 'booking_count'],
        [db.sequelize.fn('SUM', db.sequelize.col('total_amount')), 'total_spent'],
      ],
      where: { status: ['confirmed','completed'] },
      group:  ['owner_id', 'owner.id'],
      order:  [[db.sequelize.fn('SUM', db.sequelize.col('total_amount')), 'DESC']],
      limit:  5,
      include: [{ model: db.User, as: 'owner', attributes: ['id','first_name','last_name','email'] }],
    });

    return res.json({
      status: 'success',
      data: { status_breakdown: counts, top_models: topModels, top_owners: topOwners },
    });
  } catch (err) {
    console.error('[getBookingStats]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch booking stats.' });
  }
};

// ── GET /api/admin/dashboard/user-stats ───────────────────────────────────────
const getUserStats = async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const growth = [];

    for (let i = parseInt(months) - 1; i >= 0; i--) {
      const date  = new Date();
      date.setMonth(date.getMonth() - i);
      const year  = date.getFullYear();
      const month = date.getMonth();
      const start = new Date(year, month, 1);
      const end   = new Date(year, month + 1, 0, 23, 59, 59);

      const [models, owners] = await Promise.all([
        db.ModelProfile.count({ where: { created_at: { [Op.between]: [start, end] } } }),
        db.ShowbizProfile.count({ where: { created_at: { [Op.between]: [start, end] } } }),
      ]);

      growth.push({
        month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
        new_models:  models || 0,
        new_owners:  owners || 0,
        total_new:  (models || 0) + (owners || 0),
      });
    }

    // Model stats by gender
    const byGender = await db.ModelProfile.findAll({
      attributes: ['gender', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      where: { status: 'approved', gender: { [Op.ne]: null } },
      group: ['gender'],
    });

    // Model stats by experience
    const byExperience = await db.ModelProfile.findAll({
      attributes: ['experience', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      where: { status: 'approved', experience: { [Op.ne]: null } },
      group: ['experience'],
    });

    // Model stats by location
    const byCity = await db.ModelProfile.findAll({
      attributes: ['city', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
      where: { status: 'approved', city: { [Op.ne]: null } },
      group: ['city'],
      order: [[db.sequelize.fn('COUNT', db.sequelize.col('id')), 'DESC']],
      limit: 10,
    });

    return res.json({
      status: 'success',
      data: { growth, by_gender: byGender, by_experience: byExperience, top_cities: byCity },
    });
  } catch (err) {
    console.error('[getUserStats]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch user stats.' });
  }
};

// ── GET /api/admin/dashboard/recent-activity ──────────────────────────────────
const getRecentActivity = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const n = parseInt(limit);

    const [recentBookings, recentPayments, recentUsers, recentMessages] = await Promise.all([
      db.Booking.findAll({
        limit: n, order: [['created_at','DESC']],
        attributes: ['id','event_title','status','total_amount','created_at'],
        include: [
          { model: db.User,         as: 'owner', attributes: ['first_name','last_name'] },
          { model: db.ModelProfile, as: 'model', include: [{ model: db.User, as: 'user', attributes: ['first_name','last_name'] }] },
        ],
      }),
      db.Payment.findAll({
        limit: n, order: [['created_at','DESC']],
        attributes: ['id','amount','status','currency','created_at'],
        include: [
          { model: db.User,    as: 'payer',   attributes: ['first_name','last_name'] },
          { model: db.Booking, as: 'booking', attributes: ['event_title'] },
        ],
      }),
      db.User.findAll({
        limit: n, order: [['created_at','DESC']],
        attributes: ['id','first_name','last_name','email','created_at'],
        include: [{
          model: db.Role, as: 'roles',
          through: { attributes: [] },
          attributes: ['name','display_name'],
        }],
      }),
      db.Conversation.findAll({
        limit: n, order: [['last_message_at','DESC']],
        where: { status: 'open' },
        attributes: ['id','subject','participant_role','last_message_at'],
        include: [{ model: db.User, as: 'participant', attributes: ['first_name','last_name'] }],
      }),
    ]);

    return res.json({
      status: 'success',
      data: {
        recent_bookings:  recentBookings,
        recent_payments:  recentPayments,
        recent_users:     recentUsers,
        open_messages:    recentMessages,
      },
    });
  } catch (err) {
    console.error('[getRecentActivity]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch recent activity.' });
  }
};

// ── GET /api/admin/dashboard/platform-health ──────────────────────────────────
const getPlatformHealth = async (req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      pendingApprovals,
      pendingBookings,
      pendingPayouts,
      failedPayments,
      unreadMessages,
      suspendedUsers,
    ] = await Promise.all([
      db.ModelProfile.count({ where: { status: 'pending' } }),
      db.Booking.count({ where: { status: 'pending' } }),
      db.Payout.count({ where: { status: 'pending' } }),
      db.Payment.count({ where: { status: 'failed', created_at: { [Op.gte]: last24h } } }),
      db.Message.count({ where: { is_read: false } }),
      db.User.count({ where: { is_suspended: true } }),
    ]);

    const alerts = [];
    if (pendingApprovals > 0) alerts.push({ type: 'warning', message: `${pendingApprovals} model(s) awaiting approval` });
    if (pendingBookings  > 0) alerts.push({ type: 'warning', message: `${pendingBookings} booking(s) awaiting admin review` });
    if (pendingPayouts   > 0) alerts.push({ type: 'info',    message: `${pendingPayouts} payout(s) pending processing` });
    if (failedPayments   > 0) alerts.push({ type: 'danger',  message: `${failedPayments} payment(s) failed in the last 24h` });
    if (unreadMessages   > 0) alerts.push({ type: 'info',    message: `${unreadMessages} unread message(s)` });

    return res.json({
      status: 'success',
      data: {
        alerts,
        counts: {
          pending_approvals: pendingApprovals,
          pending_bookings:  pendingBookings,
          pending_payouts:   pendingPayouts,
          failed_payments:   failedPayments,
          unread_messages:   unreadMessages,
          suspended_users:   suspendedUsers,
        },
      },
    });
  } catch (err) {
    console.error('[getPlatformHealth]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch platform health.' });
  }
};

module.exports = {
  getOverview, getRevenueChart, getBookingStats,
  getUserStats, getRecentActivity, getPlatformHealth,
};
