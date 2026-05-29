'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reports', {
      id:           { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:      { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      type:         { type: Sequelize.ENUM('report', 'feedback', 'complaint', 'suggestion'), allowNull: false },
      category:     { type: Sequelize.ENUM('booking', 'payment', 'profile', 'safety', 'technical', 'other'), allowNull: false },
      subject:      { type: Sequelize.STRING(300), allowNull: false },
      message:      { type: Sequelize.TEXT, allowNull: false },
      related_id:   { type: Sequelize.UUID },
      related_type: { type: Sequelize.STRING(50) },
      status:       { type: Sequelize.ENUM('open', 'in_review', 'resolved', 'closed'), defaultValue: 'open' },
      priority:     { type: Sequelize.ENUM('low', 'medium', 'high', 'urgent'), defaultValue: 'medium' },
      admin_reply:  { type: Sequelize.TEXT },
      replied_by:   { type: Sequelize.UUID },
      replied_at:   { type: Sequelize.DATE },
      attachments:  { type: Sequelize.JSONB, defaultValue: [] },
      voice_note_url:       { type: Sequelize.STRING(500) },
      voice_note_public_id: { type: Sequelize.STRING(500) },
      created_at:   { type: Sequelize.DATE, allowNull: false },
      updated_at:   { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('reports', ['user_id']);
    await queryInterface.addIndex('reports', ['status']);
    await queryInterface.addIndex('reports', ['type']);
    console.log('reports table created');
  },
  async down(queryInterface) {
    await queryInterface.dropTable('reports');
  },
};
