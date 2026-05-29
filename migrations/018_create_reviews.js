'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reviews', {
      id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      booking_id:  { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'bookings', key: 'id' } },
      reviewer_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      model_id:    { type: Sequelize.UUID, allowNull: false, references: { model: 'model_profiles', key: 'id' } },
      rating:      { type: Sequelize.INTEGER, allowNull: false },
      title:       { type: Sequelize.STRING(200) },
      comment:     { type: Sequelize.TEXT },
      is_visible:  { type: Sequelize.BOOLEAN, defaultValue: true },
      created_at:  { type: Sequelize.DATE, allowNull: false },
      updated_at:  { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('reviews', ['model_id']);
    await queryInterface.addIndex('reviews', ['reviewer_id']);
    await queryInterface.addIndex('reviews', ['booking_id']);
    console.log('reviews table created');
  },
  async down(queryInterface) {
    await queryInterface.dropTable('reviews');
  },
};
