'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('contact_submissions', {
      id:         { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name:       { type: Sequelize.STRING(200), allowNull: false },
      email:      { type: Sequelize.STRING(200), allowNull: false },
      subject:    { type: Sequelize.STRING(300), allowNull: false },
      message:    { type: Sequelize.TEXT, allowNull: false },
      status:     { type: Sequelize.ENUM('new', 'read', 'replied', 'closed'), defaultValue: 'new' },
      admin_note: { type: Sequelize.TEXT },
      ip_address: { type: Sequelize.STRING(100) },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('contact_submissions', ['status']);
    console.log('contact_submissions table created');
  },
  async down(queryInterface) {
    await queryInterface.dropTable('contact_submissions');
  },
};
