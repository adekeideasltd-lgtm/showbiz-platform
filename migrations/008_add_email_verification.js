'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'email_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
    await queryInterface.addColumn('users', 'email_verify_token', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'email_verify_expires', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    console.log('Email verification columns added.');
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'email_verified');
    await queryInterface.removeColumn('users', 'email_verify_token');
    await queryInterface.removeColumn('users', 'email_verify_expires');
  },
};
