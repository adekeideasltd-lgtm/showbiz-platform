'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bank_transfers', {
      id:           { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:      { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      booking_id:   { type: Sequelize.UUID },
      amount:       { type: Sequelize.DECIMAL(12,2), allowNull: false },
      bank_name:    { type: Sequelize.STRING(100) },
      account_name: { type: Sequelize.STRING(200) },
      reference:    { type: Sequelize.STRING(200), allowNull: false },
      receipt_url:  { type: Sequelize.STRING(500) },
      receipt_public_id: { type: Sequelize.STRING(500) },
      status:       { type: Sequelize.ENUM('pending', 'confirmed', 'rejected'), defaultValue: 'pending' },
      admin_note:   { type: Sequelize.TEXT },
      confirmed_by: { type: Sequelize.UUID },
      confirmed_at: { type: Sequelize.DATE },
      created_at:   { type: Sequelize.DATE, allowNull: false },
      updated_at:   { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('bank_transfers', ['user_id']);
    await queryInterface.addIndex('bank_transfers', ['status']);
    await queryInterface.addIndex('bank_transfers', ['reference']);
    console.log('bank_transfers table created');
  },
  async down(queryInterface) {
    await queryInterface.dropTable('bank_transfers');
  },
};
