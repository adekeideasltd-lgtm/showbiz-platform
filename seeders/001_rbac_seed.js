'use strict';

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const PERMISSIONS = [
  { module: 'users',     action: 'view',    name: 'users.view',       display_name: 'View Users' },
  { module: 'users',     action: 'create',  name: 'users.create',     display_name: 'Create Users' },
  { module: 'users',     action: 'edit',    name: 'users.edit',       display_name: 'Edit Users' },
  { module: 'users',     action: 'delete',  name: 'users.delete',     display_name: 'Delete Users' },
  { module: 'users',     action: 'manage',  name: 'users.manage',     display_name: 'Manage Users' },
  { module: 'roles',     action: 'view',    name: 'roles.view',       display_name: 'View Roles' },
  { module: 'roles',     action: 'create',  name: 'roles.create',     display_name: 'Create Roles' },
  { module: 'roles',     action: 'edit',    name: 'roles.edit',       display_name: 'Edit Roles' },
  { module: 'roles',     action: 'delete',  name: 'roles.delete',     display_name: 'Delete Roles' },
  { module: 'roles',     action: 'manage',  name: 'roles.manage',     display_name: 'Assign Roles' },
  { module: 'models',    action: 'view',    name: 'models.view',      display_name: 'View Models' },
  { module: 'models',    action: 'create',  name: 'models.create',    display_name: 'Create Model Profile' },
  { module: 'models',    action: 'edit',    name: 'models.edit',      display_name: 'Edit Model Profile' },
  { module: 'models',    action: 'delete',  name: 'models.delete',    display_name: 'Delete Model Profile' },
  { module: 'models',    action: 'approve', name: 'models.approve',   display_name: 'Approve Models' },
  { module: 'bookings',  action: 'view',    name: 'bookings.view',    display_name: 'View Bookings' },
  { module: 'bookings',  action: 'create',  name: 'bookings.create',  display_name: 'Create Bookings' },
  { module: 'bookings',  action: 'edit',    name: 'bookings.edit',    display_name: 'Edit Bookings' },
  { module: 'bookings',  action: 'delete',  name: 'bookings.delete',  display_name: 'Delete Bookings' },
  { module: 'bookings',  action: 'approve', name: 'bookings.approve', display_name: 'Approve Bookings' },
  { module: 'payments',  action: 'view',    name: 'payments.view',    display_name: 'View Payments' },
  { module: 'payments',  action: 'manage',  name: 'payments.manage',  display_name: 'Manage Payments' },
  { module: 'payments',  action: 'export',  name: 'payments.export',  display_name: 'Export Payments' },
  { module: 'reports',   action: 'view',    name: 'reports.view',     display_name: 'View Reports' },
  { module: 'reports',   action: 'export',  name: 'reports.export',   display_name: 'Export Reports' },
  { module: 'settings',  action: 'view',    name: 'settings.view',    display_name: 'View Settings' },
  { module: 'settings',  action: 'manage',  name: 'settings.manage',  display_name: 'Manage Settings' },
  { module: 'content',   action: 'view',    name: 'content.view',     display_name: 'View Content' },
  { module: 'content',   action: 'approve', name: 'content.approve',  display_name: 'Approve Content' },
  { module: 'content',   action: 'delete',  name: 'content.delete',   display_name: 'Remove Content' },
  { module: 'analytics', action: 'view',    name: 'analytics.view',   display_name: 'View Analytics' },
  { module: 'analytics', action: 'export',  name: 'analytics.export', display_name: 'Export Analytics' },
];

const ROLES = [
  {
    name: 'super_admin', display_name: 'Super Admin', is_system: true,
    description: 'Unrestricted access.',
    permissions: '*',
  },
  {
    name: 'admin', display_name: 'Admin', is_system: true,
    description: 'Full platform management.',
    permissions: [
      'users.view','users.create','users.edit','users.manage',
      'models.view','models.create','models.edit','models.approve',
      'bookings.view','bookings.create','bookings.edit','bookings.approve',
      'payments.view','payments.manage',
      'reports.view','reports.export',
      'settings.view',
      'content.view','content.approve','content.delete',
      'analytics.view',
    ],
  },
  {
    name: 'manager', display_name: 'Manager', is_system: true,
    description: 'Day-to-day operations.',
    permissions: [
      'users.view',
      'models.view','models.edit',
      'bookings.view','bookings.create','bookings.edit','bookings.approve',
      'payments.view',
      'reports.view',
      'content.view','content.approve',
      'analytics.view',
    ],
  },
  {
    name: 'moderator', display_name: 'Moderator', is_system: true,
    description: 'Content review.',
    permissions: [
      'users.view',
      'models.view','models.approve',
      'bookings.view',
      'content.view','content.approve','content.delete',
    ],
  },
  {
    name: 'model', display_name: 'Model', is_system: true,
    description: 'Talent account.',
    permissions: ['models.view','models.edit','bookings.view'],
  },
  {
    name: 'showbiz_owner', display_name: 'Showbiz Owner', is_system: true,
    description: 'Hiring account.',
    permissions: ['models.view','bookings.view','bookings.create','payments.view'],
  },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const permRecords = PERMISSIONS.map(p => ({
      id: uuidv4(), name: p.name, display_name: p.display_name,
      module: p.module, action: p.action, guard_name: 'api',
      created_at: now, updated_at: now,
    }));
    await queryInterface.bulkInsert('permissions', permRecords);

    const permMap = {};
    permRecords.forEach(p => { permMap[p.name] = p.id; });

    const roleRecords = ROLES.map(r => ({
      id: uuidv4(), name: r.name, display_name: r.display_name,
      description: r.description, guard_name: 'api',
      is_system: r.is_system, is_active: true,
      created_at: now, updated_at: now,
    }));
    await queryInterface.bulkInsert('roles', roleRecords);

    const roleMap = {};
    roleRecords.forEach(r => { roleMap[r.name] = r.id; });

    const rolePivots = [];
    for (const roleDef of ROLES) {
      const roleId = roleMap[roleDef.name];
      const perms  = roleDef.permissions === '*' ? Object.keys(permMap) : roleDef.permissions;
      for (const permName of perms) {
        if (permMap[permName]) rolePivots.push({ role_id: roleId, permission_id: permMap[permName], created_at: now });
      }
    }
    await queryInterface.bulkInsert('role_permissions', rolePivots);

    const superAdminId = uuidv4();
    const passwordHash = await bcrypt.hash('Showbiz@SuperAdmin2024!', 12);
    await queryInterface.bulkInsert('users', [{
      id: superAdminId, email: 'superadmin@showbiz.ng',
      password_hash: passwordHash,
      first_name: 'Super', last_name: 'Admin',
      is_active: true, is_suspended: false, two_fa_enabled: false,
      force_password_reset: true, created_at: now, updated_at: now,
    }]);

    await queryInterface.bulkInsert('user_roles', [{
      id: uuidv4(), user_id: superAdminId,
      role_id: roleMap['super_admin'], assigned_by: superAdminId, created_at: now,
    }]);

    console.log('RBAC seed completed.');
    console.log('Roles seeded      : ' + ROLES.length);
    console.log('Permissions seeded: ' + PERMISSIONS.length);
    console.log('Role-perm links   : ' + rolePivots.length);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('user_roles', null, {});
    await queryInterface.bulkDelete('users', null, {});
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('permissions', null, {});
    await queryInterface.bulkDelete('roles', null, {});
  },
};
