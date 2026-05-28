'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    // Model profiles
    await queryInterface.createTable('model_profiles', {
      id:           { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:      { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      status:       { type: Sequelize.ENUM('pending','approved','rejected'), defaultValue: 'pending' },
      bio:          { type: Sequelize.TEXT },
      phone:        { type: Sequelize.STRING(20) },
      country:      { type: Sequelize.STRING(100) },
      state:        { type: Sequelize.STRING(100) },
      city:         { type: Sequelize.STRING(100) },
      height_cm:    { type: Sequelize.INTEGER },
      weight_kg:    { type: Sequelize.DECIMAL(5,2) },
      skin_tone:    { type: Sequelize.STRING(50) },
      gender:       { type: Sequelize.ENUM('male','female','non_binary','prefer_not_to_say') },
      experience:   { type: Sequelize.ENUM('beginner','intermediate','professional') },
      languages:    { type: Sequelize.ARRAY(Sequelize.STRING) },
      specialties:  { type: Sequelize.ARRAY(Sequelize.STRING) },
      hobbies:      { type: Sequelize.TEXT },
      hourly_rate:  { type: Sequelize.DECIMAL(10,2) },
      daily_rate:   { type: Sequelize.DECIMAL(10,2) },
      is_featured:  { type: Sequelize.BOOLEAN, defaultValue: false },
      approved_by:  { type: Sequelize.UUID },
      approved_at:  { type: Sequelize.DATE },
      rejected_reason: { type: Sequelize.TEXT },
      created_at:   { type: Sequelize.DATE, allowNull: false },
      updated_at:   { type: Sequelize.DATE, allowNull: false },
    });

    // Showbiz owner profiles
    await queryInterface.createTable('showbiz_profiles', {
      id:           { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:      { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      company_name: { type: Sequelize.STRING(200) },
      business_type:{ type: Sequelize.STRING(100) },
      phone:        { type: Sequelize.STRING(20) },
      country:      { type: Sequelize.STRING(100) },
      state:        { type: Sequelize.STRING(100) },
      city:         { type: Sequelize.STRING(100) },
      website:      { type: Sequelize.STRING(255) },
      bio:          { type: Sequelize.TEXT },
      created_at:   { type: Sequelize.DATE, allowNull: false },
      updated_at:   { type: Sequelize.DATE, allowNull: false },
    });

    console.log('Profile tables created.');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('showbiz_profiles');
    await queryInterface.dropTable('model_profiles');
  },
};
