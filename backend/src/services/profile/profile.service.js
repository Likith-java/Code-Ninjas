import { db } from '../../config/db.js';
import { AppError, validationError, notFoundError, forbiddenError } from '../../utils/errors.js';
import { isManagerRole, ownsEmployeeRecord } from '../../middleware/permissions.js';
import { getEmployeeStatusProvider } from '../directory/status.service.js';
import { serializeProfileFor } from '../../dto/profile.dto.js';
import {
  validateProfileUpdate,
  validateSkillCreate,
  validateCertificationCreate,
  parseResourceId,
} from '../../validators/profile.validator.js';

// ---------------------------------------------------------------------------
// Employee Profile service.
//
// Authorization is enforced here (service level) in addition to the route
// guards, so the rules hold no matter how the API is called:
//
//   GET  /employees/:id/profile            any authenticated viewer; the DTO
//                                          narrows by relation (self/other/admin)
//   PUT  /employees/:id/profile            self (personal fields) or manager
//                                          role (full Private Info tab)
//   POST/DELETE skills & certifications    self or manager role
//
// Employees can never change: employment fields, work email, protected
// identifiers, bank details, login id, role, account state — and nothing in
// this resource touches compensation data.
// ---------------------------------------------------------------------------

const MAX_SKILLS = 50;
const MAX_CERTIFICATIONS = 50;

// employees-table columns vs employee_profiles-table columns for PUT /profile.
const EMPLOYEE_COLUMN_FIELDS = new Set([
  'phone',
  'email',
  'position',
  'department',
  'company',
  'location',
  'manager_id',
  'hired_at',
  'employee_code',
  'pan',
  'uan',
]);
const PROFILE_COLUMN_FIELDS = new Set([
  'date_of_birth',
  'address',
  'personal_email',
  'gender',
  'nationality',
  'marital_status',
  'about',
  'love_about_job',
  'bank_name',
  'bank_account_number',
  'bank_ifsc',
]);

function getEmployeeOr404(id) {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!row) throw notFoundError('Employee not found');
  return row;
}

function getProfileRow(employeeId) {
  return db.prepare('SELECT * FROM employee_profiles WHERE employee_id = ?').get(employeeId);
}

function getAccount(employeeId) {
  return db.prepare('SELECT * FROM users WHERE employee_id = ?').get(employeeId);
}

function getSkills(employeeId) {
  return db
    .prepare('SELECT id, name FROM skills WHERE employee_id = ? ORDER BY id')
    .all(employeeId);
}

function getCertifications(employeeId) {
  return db
    .prepare(
      `SELECT id, name, issuer, issued_on, expires_on
       FROM certifications WHERE employee_id = ? ORDER BY id`
    )
    .all(employeeId);
}

function getManagerRow(managerId) {
  if (!managerId) return null;
  return db
    .prepare('SELECT id, first_name, last_name FROM employees WHERE id = ?')
    .get(managerId) ?? null;
}

function relationOf(actor, employee) {
  if (isManagerRole(actor?.role)) return 'manager';
  if (ownsEmployeeRecord(actor, employee.id)) return 'self';
  return 'other';
}

function assertCanManage(actor, employee) {
  if (relationOf(actor, employee) === 'other') throw forbiddenError();
}

/** Assemble everything a profile DTO needs in a fixed set of queries. */
function loadRecord(employee) {
  const status = getEmployeeStatusProvider()
    .resolveStatuses([employee.id])
    .get(employee.id);
  return {
    employee,
    profile: getProfileRow(employee.id),
    skills: getSkills(employee.id),
    certifications: getCertifications(employee.id),
    manager: getManagerRow(employee.manager_id),
    account: getAccount(employee.id),
    status,
  };
}

export function getEmployeeProfile(actor, id) {
  const employee = getEmployeeOr404(id);
  const record = loadRecord(employee);
  // The dispatcher picks Own/Other/AdminProfileDto from the caller's resolved
  // identity + database-backed role. Sensitive fields simply never enter the
  // DTOs the caller is not entitled to see.
  return serializeProfileFor(actor, record);
}

function uniqueViolationField(err) {
  const message = String(err?.message ?? '');
  if (message.includes('employees.email')) return 'email';
  if (message.includes('employees.pan')) return 'pan';
  if (message.includes('employees.uan')) return 'uan';
  if (message.includes('employees.employee_code')) return 'employee_code';
  return null;
}

/**
 * PUT /employees/:id/profile
 *
 * Partial update of the PRD Private Info tab (+ about). Employees may submit
 * only personal fields; managers may additionally submit job details, work
 * email, joining date and bank details / protected identifiers. All writes
 * (employees row + employee_profiles row) happen inside one transaction.
 */
export function updateEmployeeProfile(actor, id, body) {
  const employee = getEmployeeOr404(id);
  assertCanManage(actor, employee);

  const isManager = isManagerRole(actor?.role);
  const { errors, fields } = validateProfileUpdate(body, { isManager });

  if (!errors.length && !Object.keys(fields).length) {
    errors.push({ field: 'body', message: 'Provide at least one editable field' });
  }

  // Cross-record uniqueness pre-checks (constraint violations inside the
  // transaction are translated below as a concurrency safety net).
  if (!errors.length && fields.email) {
    const clash = db
      .prepare('SELECT id FROM employees WHERE email = ? COLLATE NOCASE AND id != ?')
      .get(fields.email, employee.id);
    if (clash) errors.push({ field: 'email', message: 'Email is already in use' });
  }
  for (const key of ['pan', 'uan', 'employee_code']) {
    if (!errors.length && fields[key]) {
      const clash = db
        .prepare(`SELECT id FROM employees WHERE ${key} = ? COLLATE NOCASE AND id != ?`)
        .get(fields[key], employee.id);
      if (clash) errors.push({ field: key, message: `${key} is already in use` });
    }
  }
  if (!errors.length && 'manager_id' in fields && fields.manager_id !== null) {
    if (fields.manager_id === employee.id) {
      errors.push({ field: 'manager_id', message: 'An employee cannot be their own manager' });
    } else {
      const exists = db
        .prepare('SELECT id FROM employees WHERE id = ?')
        .get(fields.manager_id);
      if (!exists) {
        errors.push({ field: 'manager_id', message: 'Referenced manager does not exist' });
      }
    }
  }

  if (errors.length) throw validationError('Validation failed', errors);

  try {
    db.transaction(() => {
      const employeeCols = Object.keys(fields).filter((k) => EMPLOYEE_COLUMN_FIELDS.has(k));
      if (employeeCols.length) {
        const assignments = employeeCols.map((c) => `${c} = @${c}`).join(', ');
        db.prepare(
          `UPDATE employees SET ${assignments}, updated_at = datetime('now') WHERE id = @id`
        ).run({ id: employee.id, ...fields });
      }

      const profileCols = Object.keys(fields).filter((k) => PROFILE_COLUMN_FIELDS.has(k));
      if (profileCols.length) {
        const placeholders = profileCols.map((c) => `@${c}`).join(', ');
        const updates = profileCols.map((c) => `${c} = @${c}`).join(', ');
        db.prepare(
          `INSERT INTO employee_profiles (employee_id, ${profileCols.join(', ')})
           VALUES (@employee_id, ${placeholders})
           ON CONFLICT(employee_id) DO UPDATE SET ${updates}, updated_at = datetime('now')`
        ).run({ employee_id: employee.id, ...fields });
      }
    })();
  } catch (err) {
    if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const field = uniqueViolationField(err);
      if (field) {
        throw validationError('Validation failed', [
          { field, message: `${field} is already in use` },
        ]);
      }
    }
    throw err;
  }

  const fresh = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee.id);
  return serializeProfileFor(actor, loadRecord(fresh));
}

/**
 * POST /employees/:id/skills — add one skill (case-insensitive duplicate-safe).
 */
export function addSkill(actor, id, body) {
  const employee = getEmployeeOr404(id);
  assertCanManage(actor, employee);

  const { errors, name } = validateSkillCreate(body || {});
  if (errors.length) throw validationError('Validation failed', errors);

  const existing = getSkills(employee.id);
  if (existing.length >= MAX_SKILLS) {
    throw validationError('Validation failed', [
      { field: 'name', message: `A maximum of ${MAX_SKILLS} skills is allowed` },
    ]);
  }
  if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    throw validationError('Validation failed', [
      { field: 'name', message: `Duplicate skill: ${name}` },
    ]);
  }

  let created;
  db.transaction(() => {
    const result = db
      .prepare('INSERT INTO skills (employee_id, name) VALUES (?, ?)')
      .run(employee.id, name);
    created = { id: Number(result.lastInsertRowid), name };
  })();
  return created;
}

/** DELETE /employees/:id/skills/:skillId */
export function removeSkill(actor, id, rawSkillId) {
  const employee = getEmployeeOr404(id);
  assertCanManage(actor, employee);

  const skillId = parseResourceId(rawSkillId);
  if (!skillId) {
    throw validationError('Validation failed', [
      { field: 'skillId', message: 'skillId must be a positive integer' },
    ]);
  }

  let removed = false;
  db.transaction(() => {
    const result = db
      .prepare('DELETE FROM skills WHERE id = ? AND employee_id = ?')
      .run(skillId, employee.id);
    removed = result.changes > 0;
  })();
  if (!removed) throw notFoundError('Skill not found');

  return { id: skillId, skills: getSkills(employee.id) };
}

/** POST /employees/:id/certifications — add one certification. */
export function addCertification(actor, id, body) {
  const employee = getEmployeeOr404(id);
  assertCanManage(actor, employee);

  const { errors, certification } = validateCertificationCreate(body || {});
  if (errors.length) throw validationError('Validation failed', errors);

  const count = db
    .prepare('SELECT COUNT(*) AS count FROM certifications WHERE employee_id = ?')
    .get(employee.id).count;
  if (count >= MAX_CERTIFICATIONS) {
    throw validationError('Validation failed', [
      {
        field: 'certifications',
        message: `A maximum of ${MAX_CERTIFICATIONS} certifications is allowed`,
      },
    ]);
  }

  let created;
  db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO certifications (employee_id, name, issuer, issued_on, expires_on)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        employee.id,
        certification.name,
        certification.issuer,
        certification.issued_on,
        certification.expires_on
      );
    created = { id: Number(result.lastInsertRowid), ...certification };
  })();
  return created;
}

/** DELETE /employees/:id/certifications/:certificationId */
export function removeCertification(actor, id, rawCertificationId) {
  const employee = getEmployeeOr404(id);
  assertCanManage(actor, employee);

  const certificationId = parseResourceId(rawCertificationId);
  if (!certificationId) {
    throw validationError('Validation failed', [
      { field: 'certificationId', message: 'certificationId must be a positive integer' },
    ]);
  }

  let removed = false;
  db.transaction(() => {
    const result = db
      .prepare('DELETE FROM certifications WHERE id = ? AND employee_id = ?')
      .run(certificationId, employee.id);
    removed = result.changes > 0;
  })();
  if (!removed) throw notFoundError('Certification not found');

  return { id: certificationId, certifications: getCertifications(employee.id) };
}
