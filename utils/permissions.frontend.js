/**
 * SHOWBIZ PLATFORM — Frontend RBAC Utility
 * 
 * Drop this file in your frontend src/utils/permissions.js
 *
 * Usage:
 *   import { can, hasRole, buildNavMenu } from '@/utils/permissions';
 *
 *   if (can('bookings.approve')) { ... }
 *   if (hasRole('admin'))        { ... }
 *
 *   const menu = buildNavMenu(userPermissions);
 */

'use strict';

// ─── Permission check helpers ─────────────────────────────────────────────────

/**
 * Check if the current user holds a specific permission.
 * @param {string[]} userPermissions - Array from GET /api/auth/me/permissions
 * @param {string}   permission      - e.g. 'bookings.approve'
 */
export const can = (userPermissions, permission) => {
  if (!Array.isArray(userPermissions)) return false;
  if (userPermissions.includes('*')) return true;     // Super Admin wildcard
  return userPermissions.includes(permission);
};

/**
 * Check if the current user has at least one of the given roles.
 * @param {string[]} userRoles - Array from GET /api/auth/me/permissions
 * @param {...string} roles
 */
export const hasRole = (userRoles, ...roles) => {
  if (!Array.isArray(userRoles)) return false;
  return roles.some(r => userRoles.includes(r));
};

// ─── Navigation builder ───────────────────────────────────────────────────────
/**
 * Build the sidebar navigation based on the current user's permissions.
 * Only items the user can access are returned — nothing is hidden client-side,
 * it simply never appears.
 *
 * @param {string[]} permissions
 * @param {string[]} roles
 * @returns {NavSection[]}
 */
export const buildNavMenu = (permissions, roles) => {
  const check = (perm) => can(permissions, perm);
  const isAdmin = hasRole(roles, 'super_admin', 'admin', 'manager');

  const allSections = [
    {
      section: 'Dashboard',
      icon: 'dashboard',
      path: '/dashboard',
      always: true,           // always visible once logged in
    },

    // ── Admin-facing sections ──────────────────────────────────────────────
    {
      section: 'Users',
      icon: 'users',
      path: '/admin/users',
      visible: check('users.view'),
      children: [
        { label: 'All Users',   path: '/admin/users',          visible: check('users.view') },
        { label: 'Create User', path: '/admin/users/create',   visible: check('users.create') },
      ],
    },
    {
      section: 'Models',
      icon: 'person-star',
      path: '/admin/models',
      visible: check('models.view'),
      children: [
        { label: 'Approved',    path: '/admin/models/approved',  visible: check('models.view') },
        { label: 'Pending',     path: '/admin/models/pending',   visible: check('models.approve') },
        { label: 'Rejected',    path: '/admin/models/rejected',  visible: check('models.approve') },
      ],
    },
    {
      section: 'Bookings',
      icon: 'calendar',
      path: '/admin/bookings',
      visible: check('bookings.view'),
      children: [
        { label: 'All Bookings', path: '/admin/bookings',          visible: check('bookings.view') },
        { label: 'Pending',      path: '/admin/bookings/pending',  visible: check('bookings.approve') },
        { label: 'Confirmed',    path: '/admin/bookings/confirmed',visible: check('bookings.view') },
      ],
    },
    {
      section: 'Payments',
      icon: 'wallet',
      path: '/admin/payments',
      visible: check('payments.view'),
      children: [
        { label: 'Transactions', path: '/admin/payments',         visible: check('payments.view') },
        { label: 'Payouts',      path: '/admin/payments/payouts', visible: check('payments.manage') },
        { label: 'Export',       path: '/admin/payments/export',  visible: check('payments.export') },
      ],
    },
    {
      section: 'Reports',
      icon: 'chart-bar',
      path: '/admin/reports',
      visible: check('reports.view'),
    },
    {
      section: 'Analytics',
      icon: 'trending-up',
      path: '/admin/analytics',
      visible: check('analytics.view'),
    },

    // ── Super Admin / Admin only ───────────────────────────────────────────
    {
      section: 'Role Management',
      icon: 'shield',
      path: '/admin/roles',
      visible: check('roles.view'),
      children: [
        { label: 'Roles',       path: '/admin/roles',             visible: check('roles.view') },
        { label: 'Permissions', path: '/admin/roles/permissions', visible: check('roles.view') },
        { label: 'Audit Logs',  path: '/admin/roles/audit',       visible: hasRole(roles, 'super_admin', 'admin') },
      ],
    },
    {
      section: 'Settings',
      icon: 'settings',
      path: '/admin/settings',
      visible: check('settings.view'),
    },

    // ── Model-facing sections ──────────────────────────────────────────────
    {
      section: 'My Portfolio',
      icon: 'user-circle',
      path: '/model/portfolio',
      visible: hasRole(roles, 'model') && check('models.edit'),
    },
    {
      section: 'My Bookings',
      icon: 'calendar-check',
      path: '/model/bookings',
      visible: hasRole(roles, 'model') && check('bookings.view'),
    },
    {
      section: 'My Earnings',
      icon: 'coins',
      path: '/model/earnings',
      visible: hasRole(roles, 'model'),
    },

    // ── Showbiz Owner sections ─────────────────────────────────────────────
    {
      section: 'Find Models',
      icon: 'search',
      path: '/owner/discover',
      visible: hasRole(roles, 'showbiz_owner') && check('models.view'),
    },
    {
      section: 'My Bookings',
      icon: 'briefcase',
      path: '/owner/bookings',
      visible: hasRole(roles, 'showbiz_owner') && check('bookings.view'),
    },
    {
      section: 'Saved Models',
      icon: 'heart',
      path: '/owner/saved',
      visible: hasRole(roles, 'showbiz_owner'),
    },
    {
      section: 'Payments',
      icon: 'credit-card',
      path: '/owner/payments',
      visible: hasRole(roles, 'showbiz_owner') && check('payments.view'),
    },
  ];

  // Filter to items user can see and strip out invisible children
  return allSections
    .filter(item => item.always || item.visible)
    .map(item => ({
      ...item,
      children: (item.children || []).filter(c => c.visible),
    }));
};

// ─── Route guard (React Router example) ──────────────────────────────────────
/**
 * ProtectedRoute component skeleton for React Router v6.
 *
 * Usage:
 *   <ProtectedRoute permission="bookings.approve">
 *     <BookingApprovalPage />
 *   </ProtectedRoute>
 *
 *   <ProtectedRoute role="super_admin">
 *     <RoleManagementPage />
 *   </ProtectedRoute>
 */
export const PermissionGate = ({ children, permission, role, fallback = null }) => {
  // This is a pattern — implement with your auth store (Redux/Zustand/Context)
  const { permissions, roles } = useAuthStore();  // replace with your hook

  if (permission && !can(permissions, permission)) return fallback;
  if (role && !hasRole(roles, role))               return fallback;

  return children;
};

/**
 * Fetch and cache the current user's permissions from the API.
 * Call this once on login and store in your auth state.
 *
 * @param {string} accessToken
 * @returns {Promise<{ permissions: string[], roles: string[], isSuperAdmin: boolean }>}
 */
export const fetchMyPermissions = async (accessToken) => {
  const res = await fetch('/api/auth/me/permissions', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to load permissions');
  const { data } = await res.json();
  return data;
};
