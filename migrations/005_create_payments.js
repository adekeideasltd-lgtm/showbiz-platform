'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.createTable('payments', {
      id:                  { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      booking_id:          { type: Sequelize.UUID, allowNull: false, references: { model: 'bookings', key: 'id' } },
      payer_id:            { type: Sequelize.UUID, allowNull: false },
      amount:              { type: Sequelize.DECIMAL(10,2), allowNull: false },
      commission_rate:     { type: Sequelize.DECIMAL(5,2), defaultValue: 10.00 },
      commission_amount:   { type: Sequelize.DECIMAL(10,2) },
      model_payout:        { type: Sequelize.DECIMAL(10,2) },
      currency:            { type: Sequelize.STRING(10), defaultValue: 'NGN' },
      status:              { type: Sequelize.ENUM('pending','success','failed','refunded'), defaultValue: 'pending' },
      payment_method:      { type: Sequelize.STRING(50) },
      provider:            { type: Sequelize.STRING(50), defaultValue: 'paystack' },
      provider_reference:  { type: Sequelize.STRING(255) },
      provider_access_code:{ type: Sequelize.STRING(255) },
      authorization_url:   { type: Sequelize.STRING(500) },
      paid_at:             { type: Sequelize.DATE },
      refunded_at:         { type: Sequelize.DATE },
      refund_reason:       { type: Sequelize.TEXT },
      metadata:            { type: Sequelize.JSONB },
      created_at:          { type: Sequelize.DATE, allowNull: false },
      updated_at:          { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('payouts', {
      id:               { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      payment_id:       { type: Sequelize.UUID, allowNull: false, references: { model: 'payments', key: 'id' } },
      model_id:         { type: Sequelize.UUID, allowNull: false },
      amount:           { type: Sequelize.DECIMAL(10,2), allowNull: false },
      status:           { type: Sequelize.ENUM('pending','processing','completed','failed'), defaultValue: 'pending' },
      bank_name:        { type: Sequelize.STRING(100) },
      account_number:   { type: Sequelize.STRING(20) },
      account_name:     { type: Sequelize.STRING(200) },
      transfer_code:    { type: Sequelize.STRING(255) },
      processed_by:     { type: Sequelize.UUID },
      processed_at:     { type: Sequelize.DATE },
      notes:            { type: Sequelize.TEXT },
      created_at:       { type: Sequelize.DATE, allowNull: false },
      updated_at:       { type: Sequelize.DATE, allowNull: false },
    });

    console.log('Payment tables created.');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payouts');
    await queryInterface.dropTable('payments');
  },
};
