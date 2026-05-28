'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.createTable('bookings', {
      id:             { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      owner_id:       { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      model_id:       { type: Sequelize.UUID, allowNull: false, references: { model: 'model_profiles', key: 'id' } },
      event_title:    { type: Sequelize.STRING(200), allowNull: false },
      event_type:     { type: Sequelize.STRING(100) },
      event_date:     { type: Sequelize.DATEONLY, allowNull: false },
      event_end_date: { type: Sequelize.DATEONLY },
      event_location: { type: Sequelize.STRING(255) },
      event_details:  { type: Sequelize.TEXT },
      duration_hours: { type: Sequelize.DECIMAL(5,2) },
      agreed_rate:    { type: Sequelize.DECIMAL(10,2) },
      total_amount:   { type: Sequelize.DECIMAL(10,2) },
      status: {
        type: Sequelize.ENUM(
          'pending','admin_review','model_review',
          'confirmed','rejected_by_admin',
          'rejected_by_model','cancelled','completed'
        ),
        defaultValue: 'pending',
      },
      rejection_reason:  { type: Sequelize.TEXT },
      admin_notes:       { type: Sequelize.TEXT },
      reviewed_by_admin: { type: Sequelize.UUID },
      reviewed_at_admin: { type: Sequelize.DATE },
      model_response_at: { type: Sequelize.DATE },
      completed_at:      { type: Sequelize.DATE },
      created_at:        { type: Sequelize.DATE, allowNull: false },
      updated_at:        { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('booking_status_history', {
      id:         { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      booking_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'bookings', key: 'id' }, onDelete: 'CASCADE' },
      from_status:{ type: Sequelize.STRING(50) },
      to_status:  { type: Sequelize.STRING(50), allowNull: false },
      changed_by: { type: Sequelize.UUID, allowNull: false },
      note:       { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, allowNull: false },
    });

    console.log('Booking tables created.');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('booking_status_history');
    await queryInterface.dropTable('bookings');
  },
};
