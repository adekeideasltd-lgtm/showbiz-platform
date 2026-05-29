'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('announcements', {
      id:         { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      title:      { type: Sequelize.STRING(300), allowNull: false },
      message:    { type: Sequelize.TEXT, allowNull: false },
      type:       { type: Sequelize.ENUM('info', 'warning', 'success', 'urgent'), defaultValue: 'info' },
      audience:   { type: Sequelize.ENUM('all', 'models', 'owners', 'admins'), defaultValue: 'all' },
      is_active:  { type: Sequelize.BOOLEAN, defaultValue: true },
      is_pinned:  { type: Sequelize.BOOLEAN, defaultValue: false },
      expires_at: { type: Sequelize.DATE },
      created_by: { type: Sequelize.UUID },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('announcements', ['audience']);
    await queryInterface.addIndex('announcements', ['is_active']);
    console.log('announcements table created');
  },
  async down(queryInterface) {
    await queryInterface.dropTable('announcements');
  },
};
