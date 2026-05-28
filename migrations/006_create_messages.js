'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.createTable('conversations', {
      id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      booking_id:  { type: Sequelize.UUID, allowNull: true, references: { model: 'bookings', key: 'id' } },
      participant_id: { type: Sequelize.UUID, allowNull: false },
      participant_role: { type: Sequelize.STRING(50), allowNull: false },
      subject:     { type: Sequelize.STRING(255) },
      status:      { type: Sequelize.ENUM('open','closed'), defaultValue: 'open' },
      last_message_at: { type: Sequelize.DATE },
      created_at:  { type: Sequelize.DATE, allowNull: false },
      updated_at:  { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('messages', {
      id:              { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      conversation_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'conversations', key: 'id' }, onDelete: 'CASCADE' },
      sender_id:       { type: Sequelize.UUID, allowNull: false },
      sender_role:     { type: Sequelize.STRING(50), allowNull: false },
      body:            { type: Sequelize.TEXT, allowNull: false },
      is_read:         { type: Sequelize.BOOLEAN, defaultValue: false },
      read_at:         { type: Sequelize.DATE },
      created_at:      { type: Sequelize.DATE, allowNull: false },
      updated_at:      { type: Sequelize.DATE, allowNull: false },
    });

    console.log('Messaging tables created.');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('messages');
    await queryInterface.dropTable('conversations');
  },
};
