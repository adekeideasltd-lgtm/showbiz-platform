'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('kyc_verifications', {
      id:           { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:      { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      role:         { type: Sequelize.ENUM('model', 'showbiz_owner'), allowNull: false },
      status:       { type: Sequelize.ENUM('pending', 'under_review', 'approved', 'rejected'), defaultValue: 'pending' },

      // Personal info
      full_legal_name:  { type: Sequelize.STRING(200) },
      date_of_birth:    { type: Sequelize.DATEONLY },
      phone_number:     { type: Sequelize.STRING(20) },
      address:          { type: Sequelize.TEXT },
      state:            { type: Sequelize.STRING(100) },

      // Document fields
      nin_number:       { type: Sequelize.STRING(50) },
      nin_doc_url:      { type: Sequelize.STRING(500) },
      nin_doc_public_id:{ type: Sequelize.STRING(500) },

      gov_id_type:      { type: Sequelize.STRING(50) },
      gov_id_url:       { type: Sequelize.STRING(500) },
      gov_id_public_id: { type: Sequelize.STRING(500) },

      proof_of_address_url:       { type: Sequelize.STRING(500) },
      proof_of_address_public_id: { type: Sequelize.STRING(500) },

      selfie_url:       { type: Sequelize.STRING(500) },
      selfie_public_id: { type: Sequelize.STRING(500) },

      // Owner-specific
      business_name:    { type: Sequelize.STRING(200) },
      cac_number:       { type: Sequelize.STRING(100) },
      cac_doc_url:      { type: Sequelize.STRING(500) },
      cac_doc_public_id:{ type: Sequelize.STRING(500) },

      // Admin review
      reviewed_by:      { type: Sequelize.UUID },
      reviewed_at:      { type: Sequelize.DATE },
      rejection_reason: { type: Sequelize.TEXT },
      admin_notes:      { type: Sequelize.TEXT },

      submitted_at:     { type: Sequelize.DATE },
      created_at:       { type: Sequelize.DATE, allowNull: false },
      updated_at:       { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('kyc_verifications', ['user_id']);
    await queryInterface.addIndex('kyc_verifications', ['status']);
    console.log('KYC table created.');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('kyc_verifications');
  },
};
