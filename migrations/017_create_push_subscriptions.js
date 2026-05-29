'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('push_subscriptions', {
      id:         { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:    { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      endpoint:   { type: Sequelize.TEXT, allowNull: false },
      p256dh:     { type: Sequelize.TEXT, allowNull: false },
      auth:       { type: Sequelize.TEXT, allowNull: false },
      user_agent: { type: Sequelize.STRING(300) },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('push_subscriptions', ['user_id']);
    console.log('push_subscriptions table created');
  },
  async down(queryInterface) {
    await queryInterface.dropTable('push_subscriptions');
  },
};
