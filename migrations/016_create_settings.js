'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('settings', {
      id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      key:         { type: Sequelize.STRING(100), allowNull: false, unique: true },
      value:       { type: Sequelize.TEXT, allowNull: false },
      label:       { type: Sequelize.STRING(200) },
      description: { type: Sequelize.TEXT },
      type:        { type: Sequelize.ENUM('number', 'string', 'boolean', 'json'), defaultValue: 'string' },
      updated_by:  { type: Sequelize.UUID },
      created_at:  { type: Sequelize.DATE, allowNull: false },
      updated_at:  { type: Sequelize.DATE, allowNull: false },
    });
    console.log('settings table created');
  },
  async down(queryInterface) {
    await queryInterface.dropTable('settings');
  },
};
