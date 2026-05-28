'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {

    await queryInterface.createTable('roles', {
      id:           { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name:         { type: Sequelize.STRING(100), allowNull: false, unique: true },
      display_name: { type: Sequelize.STRING(150), allowNull: false },
      description:  { type: Sequelize.TEXT, allowNull: true },
      guard_name:   { type: Sequelize.STRING(50), defaultValue: 'api' },
      is_system:    { type: Sequelize.BOOLEAN, defaultValue: false },
      is_active:    { type: Sequelize.BOOLEAN, defaultValue: true },
      created_by:   { type: Sequelize.UUID, allowNull: true },
      created_at:   { type: Sequelize.DATE, allowNull: false },
      updated_at:   { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('permissions', {
      id:           { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name:         { type: Sequelize.STRING(150), allowNull: false, unique: true },
      display_name: { type: Sequelize.STRING(200), allowNull: false },
      module:       { type: Sequelize.STRING(100), allowNull: false },
      action:       { type: Sequelize.ENUM('view','create','edit','delete','approve','export','manage'), allowNull: false },
      description:  { type: Sequelize.TEXT, allowNull: true },
      guard_name:   { type: Sequelize.STRING(50), defaultValue: 'api' },
      created_at:   { type: Sequelize.DATE, allowNull: false },
      updated_at:   { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('role_permissions', {
      role_id:       { type: Sequelize.UUID, allowNull: false, references: { model: 'roles', key: 'id' }, onDelete: 'CASCADE' },
      permission_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'permissions', key: 'id' }, onDelete: 'CASCADE' },
      granted_by:    { type: Sequelize.UUID, allowNull: true },
      created_at:    { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addConstraint('role_permissions', {
      fields: ['role_id', 'permission_id'], type: 'unique', name: 'uq_role_permission',
    });

    await queryInterface.createTable('users', {
      id:                   { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      email:                { type: Sequelize.STRING(255), allowNull: false, unique: true },
      password_hash:        { type: Sequelize.STRING(255), allowNull: false },
      first_name:           { type: Sequelize.STRING(100), allowNull: false },
      last_name:            { type: Sequelize.STRING(100), allowNull: false },
      is_active:            { type: Sequelize.BOOLEAN, defaultValue: true },
      is_suspended:         { type: Sequelize.BOOLEAN, defaultValue: false },
      suspended_reason:     { type: Sequelize.TEXT, allowNull: true },
      suspended_by:         { type: Sequelize.UUID, allowNull: true },
      two_fa_enabled:       { type: Sequelize.BOOLEAN, defaultValue: false },
      two_fa_secret:        { type: Sequelize.STRING(255), allowNull: true },
      last_login_at:        { type: Sequelize.DATE, allowNull: true },
      last_login_ip:        { type: Sequelize.STRING(45), allowNull: true },
      force_password_reset: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at:           { type: Sequelize.DATE, allowNull: false },
      updated_at:           { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('user_roles', {
      id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:     { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      role_id:     { type: Sequelize.UUID, allowNull: false, references: { model: 'roles', key: 'id' }, onDelete: 'CASCADE' },
      assigned_by: { type: Sequelize.UUID, allowNull: true },
      expires_at:  { type: Sequelize.DATE, allowNull: true },
      created_at:  { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addConstraint('user_roles', {
      fields: ['user_id', 'role_id'], type: 'unique', name: 'uq_user_role',
    });

    await queryInterface.createTable('audit_logs', {
      id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      actor_id:    { type: Sequelize.UUID, allowNull: false },
      actor_role:  { type: Sequelize.STRING(100), allowNull: false },
      action:      { type: Sequelize.STRING(100), allowNull: false },
      entity_type: { type: Sequelize.STRING(100), allowNull: false },
      entity_id:   { type: Sequelize.UUID, allowNull: true },
      old_value:   { type: Sequelize.JSONB, allowNull: true },
      new_value:   { type: Sequelize.JSONB, allowNull: true },
      ip_address:  { type: Sequelize.STRING(45), allowNull: true },
      user_agent:  { type: Sequelize.TEXT, allowNull: true },
      created_at:  { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('role_assignment_history', {
      id:           { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:      { type: Sequelize.UUID, allowNull: false },
      role_id:      { type: Sequelize.UUID, allowNull: false },
      action:       { type: Sequelize.ENUM('assigned','revoked'), allowNull: false },
      performed_by: { type: Sequelize.UUID, allowNull: false },
      reason:       { type: Sequelize.TEXT, allowNull: true },
      created_at:   { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('active_sessions', {
      id:                 { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id:            { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      refresh_token_hash: { type: Sequelize.STRING(255), allowNull: false },
      ip_address:         { type: Sequelize.STRING(45), allowNull: true },
      user_agent:         { type: Sequelize.TEXT, allowNull: true },
      is_revoked:         { type: Sequelize.BOOLEAN, defaultValue: false },
      expires_at:         { type: Sequelize.DATE, allowNull: false },
      created_at:         { type: Sequelize.DATE, allowNull: false },
      updated_at:         { type: Sequelize.DATE, allowNull: false },
    });

    console.log('All RBAC tables created successfully.');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('active_sessions');
    await queryInterface.dropTable('role_assignment_history');
    await queryInterface.dropTable('audit_logs');
    await queryInterface.dropTable('user_roles');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('role_permissions');
    await queryInterface.dropTable('permissions');
    await queryInterface.dropTable('roles');
  },
};