'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wallets', {
      id:         { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:    { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      balance:    { type: Sequelize.DECIMAL(12, 2), defaultValue: 0.00 },
      locked:     { type: Sequelize.DECIMAL(12, 2), defaultValue: 0.00 },
      currency:   { type: Sequelize.STRING(5), defaultValue: 'NGN' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('wallet_transactions', {
      id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      wallet_id:   { type: Sequelize.UUID, allowNull: false, references: { model: 'wallets', key: 'id' }, onDelete: 'CASCADE' },
      user_id:     { type: Sequelize.UUID, allowNull: false },
      type:        { type: Sequelize.ENUM('credit', 'debit', 'lock', 'unlock', 'refund'), allowNull: false },
      amount:      { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      balance_before: { type: Sequelize.DECIMAL(12, 2) },
      balance_after:  { type: Sequelize.DECIMAL(12, 2) },
      description: { type: Sequelize.STRING(500) },
      reference:   { type: Sequelize.STRING(200) },
      status:      { type: Sequelize.ENUM('pending', 'success', 'failed'), defaultValue: 'success' },
      metadata:    { type: Sequelize.JSONB, defaultValue: {} },
      created_at:  { type: Sequelize.DATE, allowNull: false },
      updated_at:  { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('wallets', ['user_id']);
    await queryInterface.addIndex('wallet_transactions', ['wallet_id']);
    await queryInterface.addIndex('wallet_transactions', ['user_id']);
    await queryInterface.addIndex('wallet_transactions', ['reference']);
    console.log('wallets & wallet_transactions tables created');
  },
  async down(queryInterface) {
    await queryInterface.dropTable('wallet_transactions');
    await queryInterface.dropTable('wallets');
  },
};
