'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.createTable('model_photos', {
      id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      model_id:    { type: Sequelize.UUID, allowNull: false, references: { model: 'model_profiles', key: 'id' }, onDelete: 'CASCADE' },
      url:         { type: Sequelize.STRING(500), allowNull: false },
      public_id:   { type: Sequelize.STRING(255) },
      is_primary:  { type: Sequelize.BOOLEAN, defaultValue: false },
      is_approved: { type: Sequelize.BOOLEAN, defaultValue: false },
      caption:     { type: Sequelize.STRING(255) },
      created_at:  { type: Sequelize.DATE, allowNull: false },
      updated_at:  { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('model_availability', {
      id:         { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      model_id:   { type: Sequelize.UUID, allowNull: false, references: { model: 'model_profiles', key: 'id' }, onDelete: 'CASCADE' },
      date:       { type: Sequelize.DATEONLY, allowNull: false },
      is_available: { type: Sequelize.BOOLEAN, defaultValue: true },
      note:       { type: Sequelize.STRING(255) },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addConstraint('model_availability', {
      fields: ['model_id', 'date'], type: 'unique', name: 'uq_model_date',
    });

    console.log('Model photos and availability tables created.');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('model_availability');
    await queryInterface.dropTable('model_photos');
  },
};
