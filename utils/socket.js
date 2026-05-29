'use strict';
const jwt = require('jsonwebtoken');
const db  = require('./models');

module.exports = (io) => {
  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user    = await db.User.findByPk(decoded.userId || decoded.id);
      if (!user) return next(new Error('User not found'));
      socket.userId = user.id;
      socket.user   = { id: user.id, email: user.email, firstName: user.first_name };
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.user?.email} (${socket.id})`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Join a conversation room
    socket.on('join_conversation', async (conversationId) => {
      try {
        // Verify user is part of this conversation
        const conv = await db.Conversation.findOne({
          where: { id: conversationId },
        });
        if (!conv) return socket.emit('error', { message: 'Conversation not found' });

        const isMember = conv.model_id === socket.userId ||
                         conv.owner_id === socket.userId ||
                         conv.admin_id === socket.userId;
        if (!isMember) return socket.emit('error', { message: 'Access denied' });

        socket.join(`conv:${conversationId}`);
        socket.emit('joined_conversation', { conversationId });
      } catch (err) {
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });

    // Send a message
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content } = data;
        if (!conversationId || !content?.trim()) return;

        const conv = await db.Conversation.findByPk(conversationId);
        if (!conv) return socket.emit('error', { message: 'Conversation not found' });

        // Save message to DB
        const message = await db.Message.create({
          conversation_id: conversationId,
          sender_id:       socket.userId,
          content:         content.trim(),
          is_read:         false,
        });

        // Load sender info
        const sender = await db.User.findByPk(socket.userId, {
          attributes: ['id', 'first_name', 'last_name'],
        });

        const msgData = {
          id:              message.id,
          conversation_id: conversationId,
          sender_id:       socket.userId,
          sender:          sender,
          content:         message.content,
          is_read:         false,
          createdAt:       message.createdAt,
        };

        // Emit to all in conversation room
        io.to(`conv:${conversationId}`).emit('new_message', msgData);

        // Send push notification to other party
        const recipientId = conv.model_id === socket.userId ? conv.owner_id : conv.model_id;
        if (recipientId) {
          // Emit to recipient's personal room if not in conversation
          io.to(`user:${recipientId}`).emit('message_notification', {
            conversationId,
            sender:  sender?.first_name,
            preview: content.slice(0, 60),
          });
        }
      } catch (err) {
        console.error('[Socket send_message]', err.message);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing_start', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        name:   socket.user?.firstName,
      });
    });

    socket.on('typing_stop', ({ conversationId }) => {
      socket.to(`conv:${conversationId}`).emit('user_stopped_typing', {
        userId: socket.userId,
      });
    });

    // Mark messages as read
    socket.on('mark_read', async ({ conversationId }) => {
      try {
        await db.Message.update(
          { is_read: true },
          { where: { conversation_id: conversationId, sender_id: { [require('sequelize').Op.ne]: socket.userId } } }
        );
        socket.to(`conv:${conversationId}`).emit('messages_read', {
          conversationId,
          readBy: socket.userId,
        });
      } catch (err) {
        console.error('[Socket mark_read]', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.user?.email}`);
    });
  });
};
