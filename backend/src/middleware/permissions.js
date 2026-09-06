import { db } from '../config/db.js';

// ---------------------------------------------------------------------------
// Centralized permission strategy for the Dayflow employee module.
//
// Every protected operation is declared once in the PERMISSIONS catalog below.
// Route guards and service-layer policy checks both consume this catalog, so
// role rules are never duplicated or scattered. Authorization always happens
// server-side: `requireAuth` resolves the caller's role from the database on
// every request (JWT claims are never trusted for access decisions).
// ---------------------------------------------------------------------------

export const ROLES = {
  ADMIN: 'admin',
  // Legacy manager-level role retained alongside ADMIN; it shares the
  // administrative permission set within the employee module.
  HR: 'hr',
  EMPLOYEE: 'employee',
};

export const MANAGER_ROLES = [ROLES.ADMIN, ROLES.HR];

/**
 * Permission catalog. Each entry lists every role allowed to perform the
 * operation globally. Capabilities that any authenticated employee holds over
 * *their own* record (view/edit own profile, manage own skills, change own
 * password, ...) are ownership-based rather than role-based and are enforced
 * by `requireOwnershipOrPermission` / service-level ownership checks, not by
 * this catalog.
 */
export const PERMISSIONS = {
  // Directory & profiles ---------------------------------------------------
  'employee:directory:read': [...MANAGER_ROLES, ROLES.EMPLOYEE],
  'employee:profile:read': [...MANAGER_ROLES, ROLES.EMPLOYEE],

  // Administrative employee management -------------------------------------
  'employee:create': [...MANAGER_ROLES],
  'employee:update:any': [...MANAGER_ROLES],
  'employee:delete': [...MANAGER_ROLES],

  // Account / security administration ---------------------------------------
  'account:security:read': [...MANAGER_ROLES],
  'account:status:manage': [...MANAGER_ROLES],
  'account:password:reset': [...MANAGER_ROLES],

  // Private content of other employees --------------------------------------
  'resume:read:any': [...MANAGER_ROLES],
  'employee:content:manage:any': [...MANAGER_ROLES],

  // Payroll processing & reports ---------------------------------------------
  'payroll:manage': [...MANAGER_ROLES],
};

export function isManagerRole(role) {
  return MANAGER_ROLES.includes(role);
}

export function hasPermission(role, permission) {
  return Boolean(PERMISSIONS[permission]?.includes(role));
}

function send401(res) {
  return res
    .status(401)
    .json({ error: { message: 'Authentication required', code: 'UNAUTHENTICATED' } });
}

function send403(res) {
  return res
    .status(403)
    .json({ error: { message: 'Insufficient permissions', code: 'FORBIDDEN' } });
}

/**
 * Guard factory: allows a route only for roles holding `permission` in the
 * catalog. Must run after `requireAuth`.
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return send401(res);
    if (!hasPermission(req.user.role, permission)) return send403(res);
    return next();
  };
}

export function ownsEmployeeRecord(actor, employeeId) {
  const actorEmployeeId = Number(actor?.employee_id);
  if (!Number.isInteger(actorEmployeeId)) return false;
  return actorEmployeeId === Number(employeeId);
}

/**
 * Guard factory for `/api/employees/:id` routes: grants access when the
 * caller acts on their own record, otherwise requires `permission`. Callers
 * who fail both checks are rejected here, so unknown resource ids never leak
 * existence information to them.
 */
export function requireOwnershipOrPermission(permission) {
  return (req, res, next) => {
    if (!req.user) return send401(res);
    if (ownsEmployeeRecord(req.user, req.params.id)) return next();
    if (!hasPermission(req.user.role, permission)) return send403(res);
    return next();
  };
}
