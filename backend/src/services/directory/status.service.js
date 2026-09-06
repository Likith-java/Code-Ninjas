import { db } from '../../config/db.js';

// ---------------------------------------------------------------------------
// Derived employee status (directory-facing)
//
// Directory "status" is a *derived* value computed by an EmployeeStatusProvider
// — never a manually maintained duplicate flag on the directory side. The
// canonical source of truth is the attendance/time-off domain, which does not
// exist yet.
//
// INTEGRATION POINT ---------------------------------------------------------
// When the attendance/time-off module ships:
//   1. Add e.g. `src/services/attendance/attendance-status.provider.js`
//      implementing the same EmployeeStatusProvider contract below, backed by
//      that module's tables (e.g. approved leave requests overlapping "now",
//      attendance check-ins) and batched in ONE query per call.
//   2. Swap the provider returned by `getEmployeeStatusProvider()` below.
// Nothing else changes: routes, services, serialization, and filters all talk
// to the contract, not to storage.
//
// TEMPORARY FALLBACK --------------------------------------------------------
// Until then, LegacyEmployeeStatusProvider derives statuses exclusively from
// data that already exists today:
//   - 'disabled'  when the linked user account is disabled
//                 (users.account_status = 'disabled')
//   - 'on_leave'  when the legacy manual employment flag is set
//                 (employees.status = 'on_leave' — pre-existing column,
//                 scheduled for removal once real time-off lands)
//   - 'active'    otherwise
// ---------------------------------------------------------------------------

/**
 * Canonical status values exposed by the directory. UI vocabulary stays stable
 * even when the underlying derivation source changes.
 * @type {('active'|'on_leave'|'disabled')[]}
 */
export const DIRECTORY_STATUSES = ['active', 'on_leave', 'disabled'];

/**
 * EmployeeStatusProvider contract (informal interface).
 *
 * Every method MUST be batch-oriented so callers can never drift into N+1
 * queries: one call resolves any number of employees.
 *
 * @interface EmployeeStatusProvider
 */
/**
 * Resolve derived statuses for many employees in one call.
 * @memberof EmployeeStatusProvider
 * @name resolveStatuses
 * @param {number[]} employeeIds non-empty array of employee ids
 * @returns {Map<number, string>} employee id -> DIRECTORY_STATUSES value
 */
/**
 * Translate a requested status filter into a SQL condition evaluated against
 * `employees` (aliased as-is; joins may be added inside the condition).
 * @memberof EmployeeStatusProvider
 * @name statusFilter
 * @param {string} status one of DIRECTORY_STATUSES
 * @returns {{ sql: string, params: unknown[] } | null} WHERE fragment, or null
 *   if the provider cannot express this filter (caller then skips it)
 */

const disabledAccountSql =
  'EXISTS (SELECT 1 FROM users u WHERE u.employee_id = employees.id AND u.account_status = \'disabled\')';
const legacyOnLeaveSql = "employees.status = 'on_leave'";

/**
 * Temporary fallback implementation. Derives statuses from existing columns;
 * see the INTEGRATION POINT note above for replacement instructions.
 */
const legacyEmployeeStatusProvider = {
  name: 'legacy-manual-flag',

  resolveStatuses(employeeIds) {
    const statuses = new Map();
    if (!employeeIds.length) return statuses;

    // Single query for the whole batch — no per-employee lookups.
    const placeholders = employeeIds.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT e.id AS id, e.status AS employment_flag, u.account_status AS account_status
         FROM employees e
         LEFT JOIN users u ON u.employee_id = e.id
         WHERE e.id IN (${placeholders})`
      )
      .all(...employeeIds);

    for (const row of rows) {
      if (row.account_status === 'disabled') {
        statuses.set(row.id, 'disabled');
      } else {
        statuses.set(row.id, row.employment_flag === 'on_leave' ? 'on_leave' : 'active');
      }
    }
    return statuses;
  },

  statusFilter(status) {
    switch (status) {
      case 'disabled':
        return { sql: disabledAccountSql, params: [] };
      case 'on_leave':
        return { sql: `(NOT ${disabledAccountSql} AND ${legacyOnLeaveSql})`, params: [] };
      case 'active':
        return { sql: `(NOT ${disabledAccountSql} AND NOT ${legacyOnLeaveSql})`, params: [] };
      default:
        return null;
    }
  },
};

/**
 * Single wiring point for the active status provider. Replace ONLY here when
 * the attendance/time-off module becomes available.
 */
export function getEmployeeStatusProvider() {
  return legacyEmployeeStatusProvider;
}
