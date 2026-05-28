'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'kyc_verified', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
    console.log('kyc_verified column added.');
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'kyc_verified');
  },
};
