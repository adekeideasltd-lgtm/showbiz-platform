'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../models');

// ── Helper: get the primary role of a user ────────────────────────────────────
const getPrimaryRole = (roles) => {
  if (roles.includes('super_admin')) return 'super_admin';
  if (roles.includes('admin'))       return 'admin';
  if (roles.includes('manager'))     return 'manager';
  if (roles.includes('moderator'))   return 'moderator';
  if (roles.includes('model'))       return 'model';
  if (roles.includes('showbiz_owner')) return 'showbiz_owner';
  return roles[0] || 'unknown';
};

const isAdminRole = (role) => ['super_admin','admin','manager','moderator'].includes(role);

// ── POST /api/messages/conversations — start a conversation with admin ────────
const createConversation = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { subject, body, booking_id } = req.body;
    if (!body) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Message body is required.' }); }

    const senderRole = getPrimaryRole(req.user.roles);

    // Models and owners can only talk to admin — not each other
    if (!isAdminRole(senderRole) && !['model','showbiz_owner'].includes(senderRole)) {
      await t.rollback();
      return res.status(403).json({ status: 'error', message: 'Invalid role for messaging.' });
    }

    // Check booking exists if provided
    if (booking_id) {
      const booking = await db.Booking.findByPk(booking_id, { transaction: t });
      if (!booking) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Booking not found.' }); }
    }

    // Check if open conversation already exists for this participant + booking
    const existing = await db.Conversation.findOne({
      where: {
        participant_id:   req.user.id,
        status:           'open',
        ...(booking_id ? { booking_id } : {}),
      },
      transaction: t,
    });

    if (existing) {
      // Add message to existing conversation instead
      const message = await db.Message.create({
        id:              uuidv4(),
        conversation_id: existing.id,
        sender_id:       req.user.id,
        sender_role:     senderRole,
        body,
        is_read:         false,
      }, { transaction: t });

      await existing.update({ last_message_at: new Date() }, { transaction: t });
      await t.commit();

      return res.status(201).json({
        status: 'success',
        message: 'Message added to existing conversation.',
        data: { conversation_id: existing.id, message },
      });
    }

    // Create new conversation
    const conversation = await db.Conversation.create({
      id:               uuidv4(),
      booking_id:       booking_id || null,
      participant_id:   req.user.id,
      participant_role: senderRole,
      subject:          subject || (booking_id ? 'Booking enquiry' : 'General enquiry'),
      status:           'open',
      last_message_at:  new Date(),
    }, { transaction: t });

    // Add first message
    const message = await db.Message.create({
      id:              uuidv4(),
      conversation_id: conversation.id,
      sender_id:       req.user.id,
      sender_role:     senderRole,
      body,
      is_read:         false,
    }, { transaction: t });

    await t.commit();

    return res.status(201).json({
      status: 'success',
      message: 'Conversation started. Admin will respond shortly.',
      data: { conversation, message },
    });
  } catch (err) {
    await t.rollback();
    console.error('[createConversation]', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to start conversation.' });
  }
};

// ── POST /api/messages/conversations/:id — reply to a conversation ────────────
const replyToConversation = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { body } = req.body;
    if (!body) { await t.rollback(); return res.status(400).json({ status: 'error', message: 'Message body is required.' }); }

    const conversation = await db.Conversation.findByPk(req.params.id, { transaction: t });
    if (!conversation) { await t.rollback(); return res.status(404).json({ status: 'error', message: 'Conversation not found.' }); }
    if (conversation.status === 'closed') { await t.rollback(); return res.status(400).json({ status: 'error', message: 'This conversation is closed.' }); }

    const senderRole = getPrimaryRole(req.user.roles);

    // Access control:
    // Admin can reply to any conversation
    // Model/Owner can only reply to their own conversations
    const isAdmin = isAdminRole(senderRole);
    const isParticipant = conversation.participant_id === req.user.id;

    if (!isAdmin && !isParticipant) {
      await t.rollback();
      return res.status(403).json({ status: 'error', message: 'You are not part of this conversation.' });
    }

    const message = await db.Message.create({
      id:              uuidv4(),
      conversation_id: conversation.id,
      sender_id:       req.user.id,
      sender_role:     senderRole,
      body,
      is_read:         false,
    }, { transaction: t });

    await conversation.update({ last_message_at: new Date() }, { transaction: t });
    await t.commit();

    return res.status(201).json({ status: 'success', data: message });
  } catch (err) {
    await t.rollback();
    return res.status(500).json({ status: 'error', message: 'Failed to send message.' });
  }
};

// ── GET /api/messages/conversations — list own conversations ──────────────────
const listConversations = async (req, res) => {
  try {
    const senderRole = getPrimaryRole(req.user.roles);
    const where = {};

    // Admins see all conversations; others see only their own
    if (!isAdminRole(senderRole)) {
      where.participant_id = req.user.id;
    }

    if (req.query.status) where.status = req.query.status;

    const conversations = await db.Conversation.findAll({
      where,
      order: [['last_message_at', 'DESC']],
      include: [
        {
          model: db.User,
          as:    'participant',
          attributes: ['id','first_name','last_name','email'],
        },
        {
          model: db.Message,
          as:    'messages',
          limit:  1,
          order:  [['created_at','DESC']],
          attributes: ['id','body','sender_role','is_read','created_at'],
        },
      ],
    });

    // Attach unread count to each conversation
    const withUnread = await Promise.all(conversations.map(async (conv) => {
      const unread = await db.Message.count({
        where: {
          conversation_id: conv.id,
          is_read:         false,
          sender_id:       { [require('sequelize').Op.ne]: req.user.id },
        },
      });
      return { ...conv.toJSON(), unread_count: unread };
    }));

    return res.json({ status: 'success', data: withUnread });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch conversations.' });
  }
};

// ── GET /api/messages/conversations/:id — get full conversation thread ─────────
const getConversation = async (req, res) => {
  try {
    const conversation = await db.Conversation.findByPk(req.params.id, {
      include: [
        { model: db.User, as: 'participant', attributes: ['id','first_name','last_name','email'] },
        { model: db.Message, as: 'messages', order: [['created_at','ASC']],
          attributes: ['id','body','sender_role','is_read','created_at','read_at'],
          include: [{ model: db.User, as: 'sender', attributes: ['id','first_name','last_name'] }] },
      ],
    });

    if (!conversation) return res.status(404).json({ status: 'error', message: 'Conversation not found.' });

    const senderRole = getPrimaryRole(req.user.roles);
    const isAdmin    = isAdminRole(senderRole);
    const isParticipant = conversation.participant_id === req.user.id;

    if (!isAdmin && !isParticipant) {
      return res.status(403).json({ status: 'error', message: 'Access denied.' });
    }

    // Mark all messages from the other party as read
    await db.Message.update(
      { is_read: true, read_at: new Date() },
      { where: { conversation_id: conversation.id, is_read: false, sender_id: { [require('sequelize').Op.ne]: req.user.id } } }
    );

    return res.json({ status: 'success', data: conversation });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch conversation.' });
  }
};

// ── POST /api/messages/conversations/:id/close — admin closes conversation ────
const closeConversation = async (req, res) => {
  try {
    const conversation = await db.Conversation.findByPk(req.params.id);
    if (!conversation) return res.status(404).json({ status: 'error', message: 'Conversation not found.' });

    await conversation.update({ status: 'closed' });
    return res.json({ status: 'success', message: 'Conversation closed.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to close conversation.' });
  }
};

// ── GET /api/messages/unread — get unread message count ──────────────────────
const getUnreadCount = async (req, res) => {
  try {
    const senderRole = getPrimaryRole(req.user.roles);
    let conversationWhere = {};

    if (!isAdminRole(senderRole)) {
      conversationWhere = { participant_id: req.user.id };
    }

    const conversations = await db.Conversation.findAll({
      where: conversationWhere,
      attributes: ['id'],
    });

    const convIds = conversations.map(c => c.id);

    const unread = await db.Message.count({
      where: {
        conversation_id: convIds,
        is_read:  false,
        sender_id: { [require('sequelize').Op.ne]: req.user.id },
      },
    });

    return res.json({ status: 'success', data: { unread_count: unread } });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to get unread count.' });
  }
};

module.exports = {
  createConversation, replyToConversation,
  listConversations, getConversation,
  closeConversation, getUnreadCount,
};
