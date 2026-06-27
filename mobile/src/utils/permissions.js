const ROLE_PERMISSIONS = {
  admin: ['*'],
  superadmin: ['*'],
  manager: [
    'customers',
    'tasks',
    'inventory',
    'production',
    'purchase',
    'sales',
    'service',
    'accounts',
    'tds',
    'reports',
  ],
  staff: [
    'customers.customer_master.view',
    'customers.customer_master.add',
    'tasks.task_list.view',
    'tasks.task_list.add',
    'sales.sales_orders.view',
  ],
  viewer: [
    'customers.customer_master.view',
    'sales.sales_orders.view',
  ],
};

const ADMIN_ROLES = ['admin', 'superadmin', 'system admin', 'systemadmin'];

function checkAdditional(additionalPermissions, requiredPermission) {
  if (!additionalPermissions || typeof requiredPermission !== 'string') return false;

  if (requiredPermission.includes('.')) {
    const parts = requiredPermission.split('.');
    if (parts.length === 3) {
      const [mod, sub, act] = parts;
      if (additionalPermissions[mod]?.[sub]?.[act]) return true;
      if (additionalPermissions[mod]?.[act]) return true;
    } else if (parts.length === 2) {
      const [mod, act] = parts;
      if (additionalPermissions[mod]?.[act]) return true;
      const moduleData = additionalPermissions[mod];
      if (moduleData && typeof moduleData === 'object') {
        return Object.values(moduleData).some(
          (sub) => typeof sub === 'object' && sub !== null && sub[act] === true
        );
      }
    }
    return false;
  }

  const moduleData = additionalPermissions[requiredPermission];
  if (moduleData === true) return true;
  if (moduleData && typeof moduleData === 'object') {
    const hasAnyTrue = (obj) => {
      if (!obj || typeof obj !== 'object') return obj === true;
      return Object.values(obj).some(
        (val) => val === true || (val && typeof val === 'object' && hasAnyTrue(val))
      );
    };
    return hasAnyTrue(moduleData);
  }
  return false;
}

/**
 * Align with web CRM permission checks (array + additionalPermissions + role defaults).
 */
export function hasPermission(user, requiredPermission) {
  if (!user || !requiredPermission) return false;

  const role = String(
    user.roleName || user.role?.name || user.role || 'viewer'
  )
    .trim()
    .toLowerCase();

  if (ADMIN_ROLES.includes(role)) return true;

  const additionalPermissions = user.additionalPermissions || {};
  if (checkAdditional(additionalPermissions, requiredPermission)) return true;

  const userPermissions = user.permissions;
  const list = Array.isArray(userPermissions)
    ? userPermissions
    : userPermissions
      ? [userPermissions]
      : [];

  if (list.includes('*')) return true;
  if (
    list.some(
      (p) => (typeof p === 'string' ? p : p?.key) === requiredPermission
    )
  ) {
    return true;
  }

  const rolePerms = ROLE_PERMISSIONS[role];
  if (rolePerms?.includes('*') || rolePerms?.includes(requiredPermission)) {
    return true;
  }

  return false;
}
