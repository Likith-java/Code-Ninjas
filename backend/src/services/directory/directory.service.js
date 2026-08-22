import { db } from '../../config/db.js';
import { notFoundError } from '../../utils/errors.js';
import { getEmployeeStatusProvider } from './status.service.js';

// ---------------------------------------------------------------------------
// Employee Directory read model
//
// A dedicated projection for directory cards: only the fields a card needs,
// never full employee rows. Private profile data (date of birth, address,
// PAN/UAN, resume, ...), account secrets (password hashes, tokens, login ids)
// and compensation simply have no representation here — they cannot leak
// because they are never selected.
//
// Query shape: exactly two statements per listing (COUNT + one paged SELECT),
// plus ONE batched status resolution per page. No N+1 anywhere.
// ---------------------------------------------------------------------------

const CARD_COLUMNS = `
  employees.id,
  employees.first_name,
  employees.last_name,
  employees.position,
  employees.department,
  employees.avatar_url
`;

// Directory search covers non-sensitive, work-related fields only:
// name, position, department and skills. Deliberately excluded: email,
// phone, login ids, identifiers (PAN/UAN/employee_code) — these are not
// shown on cards and must not be discoverable through the directory.
function buildSearchCondition(q) {
  const like = `%${q}%`;
  return {
    sql: `(employees.first_name LIKE ? OR employees.last_name LIKE ? OR employees.position LIKE ?
      OR employees.department LIKE ?
      OR EXISTS (SELECT 1 FROM skills s WHERE s.employee_id = employees.id AND s.name LIKE ?))`,
    params: [like, like, like, like, like],
  };
}

/**
 * Project a raw row into the public card shape. `status` is always supplied by
 * an EmployeeStatusProvider — this module never reads status columns itself.
 */
export function projectDirectoryCard(row, status) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: `${row.first_name} ${row.last_name}`.trim(),
    position: row.position,
    department: row.department,
    avatar_url: row.avatar_url,
    status,
  };
}

export function listDirectoryCards({ q = '', department = null, status = null, page = 1, limit = 50 }) {
  const provider = getEmployeeStatusProvider();
  const conditions = [];
  const params = [];

  if (q) {
    const search = buildSearchCondition(q);
    conditions.push(search.sql);
    params.push(...search.params);
  }
  if (department) {
    conditions.push('employees.department = ?');
    params.push(department);
  }
  // Status is derived, so filtering is delegated to the active provider.
  if (status) {
    const filter = provider.statusFilter(status);
    if (filter) {
      conditions.push(filter.sql);
      params.push(...filter.params);
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM employees ${where}`)
    .get(...params).count;

  const rows = db
    .prepare(
      `SELECT ${CARD_COLUMNS} FROM employees ${where}
       ORDER BY employees.last_name COLLATE NOCASE, employees.first_name COLLATE NOCASE
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  const statuses = provider.resolveStatuses(rows.map((row) => row.id));
  return { cards: rows.map((row) => projectDirectoryCard(row, statuses.get(row.id))), total };
}

export function getDirectoryCard(id) {
  const row = db.prepare(`SELECT ${CARD_COLUMNS} FROM employees WHERE employees.id = ?`).get(id);
  if (!row) throw notFoundError('Employee not found');
  const statuses = getEmployeeStatusProvider().resolveStatuses([row.id]);
  return projectDirectoryCard(row, statuses.get(row.id));
}
