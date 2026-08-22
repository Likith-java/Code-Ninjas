import { db } from '../config/db.js';
import {
  AppError,
  validationError,
  notFoundError,
  forbiddenError,
} from '../utils/errors.js';
import { generateTempPassword, hashPassword } from '../utils/password.js';
import { generateLoginId } from './login-id.service.js';
import {
  validateEmployee,
  validateProfileFields,
  validateSkillsPayload,
  validateCertificationsPayload,
  validateResumePayload,
} from '../validators/employee.validator.js';

const MANAGER_ROLES = ['admin', 'hr'];

const CARD_FIELDS = 'id, first_name, last_name, position, department, avatar_url, status';

function isManager(user) {
  return MANAGER_ROLES.includes(user?.role);
}

function fullName(row) {
  return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
}

export function getProfileRow(employeeId) {
  return db.prepare('SELECT * FROM employee_profiles WHERE employee_id = ?').get(employeeId);
}

function getSkills(employeeId) {
  return db
    .prepare('SELECT name FROM skills WHERE employee_id = ? ORDER BY id')
    .all(employeeId)
    .map((row) => row.name);
}

function getCertifications(employeeId) {
  return db
    .prepare(
      `SELECT id, name, issuer, issued_on, expires_on
       FROM certifications WHERE employee_id = ? ORDER BY id`
    )
    .all(employeeId);
}

function toCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: fullName(row),
    position: row.position,
    department: row.department,
    avatar_url: row.avatar_url,
    status: row.status,
  };
}

function relationOf(actor, employeeId) {
  if (isManager(actor)) return 'manager';
  if (Number(actor?.employee_id) === Number(employeeId)) return 'self';
  return 'other';
}

function serializeDetail(actor, employee) {
  const relation = relationOf(actor, employee.id);
  const card = toCard(employee);

  if (relation === 'other') {
    const profile = getProfileRow(employee.id);
    return {
      ...card,
      hired_at: employee.hired_at,
      about: profile?.about ?? null,
      skills: getSkills(employee.id),
      certifications: getCertifications(employee.id),
      viewer: 'other',
      can_edit: false,
    };
  }

  const profile = getProfileRow(employee.id);
  return {
    ...card,
    email: employee.email,
    phone: employee.phone,
    status: employee.status,
    hired_at: employee.hired_at,
    created_at: employee.created_at,
    updated_at: employee.updated_at,
    date_of_birth: profile?.date_of_birth ?? null,
    address: profile?.address ?? null,
    about: profile?.about ?? null,
    resume: {
      text: profile?.resume_text ?? null,
      pdf_name: profile?.resume_pdf_name ?? null,
      pdf_size: profile?.resume_pdf_size ?? null,
      has_pdf: Boolean(profile?.resume_pdf),
    },
    skills: getSkills(employee.id),
    certifications: getCertifications(employee.id),
    viewer: relation,
    can_edit: true,
  };
}

export function listEmployees({ q = '', department = null, status = null, page = 1, limit = 50 }) {
  const conditions = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      `(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR position LIKE ?
        OR EXISTS (SELECT 1 FROM users u WHERE u.employee_id = employees.id AND u.login_id LIKE ?)
        OR EXISTS (SELECT 1 FROM skills s WHERE s.employee_id = employees.id AND s.name LIKE ?))`
    );
    params.push(like, like, like, like, like, like);
  }
  if (department) {
    conditions.push('department = ?');
    params.push(department);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const total = db
    .prepare(`SELECT COUNT(*) AS count FROM employees ${where}`)
    .get(...params).count;
  const rows = db
    .prepare(
      `SELECT ${CARD_FIELDS} FROM employees ${where}
       ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return { rows: rows.map(toCard), total };
}

export function getEmployeeCard(id) {
  const row = db.prepare(`SELECT ${CARD_FIELDS} FROM employees WHERE id = ?`).get(id);
  if (!row) throw notFoundError('Employee not found');
  return toCard(row);
}

export function getEmployeeDetail(actor, id) {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!row) throw notFoundError('Employee not found');
  return serializeDetail(actor, row);
}

export function provisionEmployee(payload) {
  const { errors, fields } = validateEmployee(payload || {});
  if (!errors.some((e) => e.field === 'email')) {
    const existingEmail = db
      .prepare('SELECT id FROM employees WHERE email = ? COLLATE NOCASE')
      .get(fields.email ?? '');
    if (existingEmail) errors.push({ field: 'email', message: 'Email is already in use' });
  }
  if (errors.length) throw validationError('Validation failed', errors);

  const created = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO employees (first_name, last_name, email, position, department, phone, avatar_url, status, hired_at)
         VALUES (@first_name, @last_name, @email, @position, @department, @phone, @avatar_url, @status, COALESCE(@hired_at, date('now')))`
      )
      .run({
        first_name: fields.first_name,
        last_name: fields.last_name,
        email: fields.email.toLowerCase(),
        position: fields.position,
        department: fields.department,
        phone: fields.phone,
        avatar_url: fields.avatar_url,
        status: fields.status,
        hired_at: fields.hired_at,
      });
    const employeeId = result.lastInsertRowid;

    db.prepare('INSERT INTO employee_profiles (employee_id) VALUES (?)').run(employeeId);

    const loginId = generateLoginId(db, {
      firstName: fields.first_name,
      lastName: fields.last_name,
      hiredAt: fields.hired_at,
    });
    const tempPassword = generateTempPassword();
    db.prepare(
      `INSERT INTO users (login_id, email, password_hash, role, employee_id, must_change_password)
       VALUES (?, ?, ?, 'employee', ?, 1)`
    ).run(loginId, fields.email.toLowerCase(), hashPassword(tempPassword), employeeId);

    return { employeeId, loginId, tempPassword };
  })();

  const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(created.employeeId);
  return {
    ...serializeDetail({ role: 'hr' }, employee),
    account: { login_id: created.loginId, temp_password: created.tempPassword },
  };
}

const EMPLOYEE_CORE_FIELDS = [
  'first_name',
  'last_name',
  'email',
  'position',
  'department',
  'status',
  'hired_at',
];
const SHARED_EMPLOYEE_FIELDS = ['phone', 'avatar_url'];
const SELF_PROFILE_FIELDS = ['date_of_birth', 'address', 'about'];

function upsertProfileFields(employeeId, fields) {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  const placeholders = cols.map((c) => `@${c}`).join(', ');
  const updates = cols.map((c) => `${c} = @${c}`).join(', ');
  db.prepare(
    `INSERT INTO employee_profiles (employee_id, ${cols.join(', ')})
     VALUES (@employee_id, ${placeholders})
     ON CONFLICT(employee_id) DO UPDATE SET ${updates}, updated_at = datetime('now')`
  ).run({ employee_id: employeeId, ...fields });
}

export function updateEmployee(actor, id, body) {
  const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!existing) throw notFoundError('Employee not found');

  const manager = isManager(actor);
  const self = Number(actor.employee_id) === Number(existing.id);
  if (!manager && !self) throw forbiddenError();

  const input = body || {};
  const allowed = new Set([
    ...(manager ? EMPLOYEE_CORE_FIELDS : []),
    ...SHARED_EMPLOYEE_FIELDS,
    ...SELF_PROFILE_FIELDS,
  ]);

  const rejected = Object.keys(input).filter(
    (key) => !allowed.has(key) && !['skills', 'certifications'].includes(key)
  );
  if (rejected.length) {
    throw validationError('Validation failed', [
      { field: rejected[0], message: manager ? 'Unknown or read-only field' : 'You are not allowed to edit this field' },
    ]);
  }
  if (!manager && EMPLOYEE_CORE_FIELDS.some((key) => key in input)) {
    throw validationError('Validation failed', [
      { field: 'core', message: 'Only managers can edit employment details' },
    ]);
  }

  const coreInput = {};
  for (const key of [...EMPLOYEE_CORE_FIELDS, ...SHARED_EMPLOYEE_FIELDS]) {
    if (key in input) coreInput[key] = input[key];
  }
  const merged = { ...existing, ...coreInput };
  const { errors, fields } = validateEmployee(merged);
  if (fields.email && fields.email.toLowerCase() !== String(existing.email).toLowerCase()) {
    const clash = db
      .prepare('SELECT id FROM employees WHERE email = ? COLLATE NOCASE AND id != ?')
      .get(fields.email, existing.id);
    if (clash) errors.push({ field: 'email', message: 'Email is already in use' });
  }
  if (errors.length) throw validationError('Validation failed', errors);

  const { errors: profileErrors, fields: profileFields } = validateProfileFields(input);
  if (profileErrors.length) throw validationError('Validation failed', profileErrors);

  db.transaction(() => {
    db.prepare(
      `UPDATE employees
       SET first_name = @first_name, last_name = @last_name, email = @email, position = @position,
           department = @department, phone = @phone, avatar_url = @avatar_url, status = @status,
           hired_at = @hired_at, updated_at = datetime('now')
       WHERE id = @id`
    ).run({
      id: existing.id,
      first_name: fields.first_name,
      last_name: fields.last_name,
      email: fields.email.toLowerCase(),
      position: fields.position,
      department: fields.department,
      phone: fields.phone,
      avatar_url: fields.avatar_url,
      status: fields.status ?? 'active',
      hired_at: fields.hired_at ?? existing.hired_at,
    });
    upsertProfileFields(existing.id, profileFields);
  })();

  const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(existing.id);
  return serializeDetail(actor, updated);
}

function assertSelfOrManager(actor, employee) {
  const relation = relationOf(actor, employee.id);
  if (relation === 'other') throw forbiddenError();
}

function getEmployeeOr404(id) {
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  if (!row) throw notFoundError('Employee not found');
  return row;
}

export function updateSkills(actor, id, body) {
  const employee = getEmployeeOr404(id);
  assertSelfOrManager(actor, employee);
  const { errors, skills } = validateSkillsPayload(body);
  if (errors.length) throw validationError('Validation failed', errors);

  db.transaction(() => {
    db.prepare('DELETE FROM skills WHERE employee_id = ?').run(employee.id);
    const insert = db.prepare('INSERT INTO skills (employee_id, name) VALUES (?, ?)');
    for (const name of skills) insert.run(employee.id, name);
  })();

  return { skills: getSkills(employee.id) };
}

export function updateCertifications(actor, id, body) {
  const employee = getEmployeeOr404(id);
  assertSelfOrManager(actor, employee);
  const { errors, certifications } = validateCertificationsPayload(body);
  if (errors.length) throw validationError('Validation failed', errors);

  db.transaction(() => {
    db.prepare('DELETE FROM certifications WHERE employee_id = ?').run(employee.id);
    const insert = db.prepare(
      `INSERT INTO certifications (employee_id, name, issuer, issued_on, expires_on)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const c of certifications) insert.run(employee.id, c.name, c.issuer, c.issued_on, c.expires_on);
  })();

  return { certifications: getCertifications(employee.id) };
}

export function updateResume(actor, id, body) {
  const employee = getEmployeeOr404(id);
  assertSelfOrManager(actor, employee);
  const { errors, resume_text, resume_pdf, resume_pdf_name } = validateResumePayload(body || {});
  if (errors.length) throw validationError('Validation failed', errors);

  const profile = getProfileRow(employee.id) ?? {};

  const nextText = resume_text !== undefined ? resume_text : (profile.resume_text ?? null);
  let nextPdf = resume_pdf !== undefined ? resume_pdf : (profile.resume_pdf ?? null);
  let nextPdfName = resume_pdf_name !== undefined ? resume_pdf_name : (profile.resume_pdf_name ?? null);
  if (resume_pdf === null) {
    nextPdf = null;
    nextPdfName = null;
  }
  const pdfSize = Buffer.isBuffer(nextPdf) ? nextPdf.length : null;

  db.prepare(
    `INSERT INTO employee_profiles (employee_id, resume_text, resume_pdf, resume_pdf_name, resume_pdf_size)
     VALUES (@employee_id, @resume_text, @resume_pdf, @resume_pdf_name, @resume_pdf_size)
     ON CONFLICT(employee_id) DO UPDATE SET
       resume_text = @resume_text,
       resume_pdf = @resume_pdf,
       resume_pdf_name = @resume_pdf_name,
       resume_pdf_size = @resume_pdf_size,
       updated_at = datetime('now')`
  ).run({
    employee_id: employee.id,
    resume_text: nextText,
    resume_pdf: nextPdf,
    resume_pdf_name: nextPdfName,
    resume_pdf_size: pdfSize,
  });

  return {
    resume: {
      text: nextText,
      pdf_name: nextPdfName,
      pdf_size: pdfSize,
      has_pdf: Boolean(nextPdf),
    },
  };
}

export function getResumePdf(actor, id) {
  const employee = getEmployeeOr404(id);
  assertSelfOrManager(actor, employee);
  const profile = getProfileRow(employee.id);
  if (!profile?.resume_pdf) throw notFoundError('No resume PDF uploaded');
  return {
    buffer: profile.resume_pdf,
    fileName: profile.resume_pdf_name || `employee-${employee.id}-resume.pdf`,
  };
}

export function setAccountStatus(actor, id, accountStatus) {
  if (!['active', 'disabled'].includes(accountStatus)) {
    throw validationError('Validation failed', [
      { field: 'account_status', message: 'account_status must be active or disabled' },
    ]);
  }
  const employee = getEmployeeOr404(id);
  if (Number(actor.employee_id) === Number(employee.id)) {
    throw new AppError(400, 'You cannot change your own account status', 'VALIDATION_FAILED');
  }
  const user = db.prepare('SELECT id FROM users WHERE employee_id = ?').get(employee.id);
  if (!user) throw notFoundError('No linked user account for this employee');
  db.prepare(
    `UPDATE users SET account_status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(accountStatus, user.id);
  return { employee_id: employee.id, account_status: accountStatus };
}

export function resetPassword(actor, id) {
  getEmployeeOr404(id);
  const user = db.prepare('SELECT id FROM users WHERE employee_id = ?').get(id);
  if (!user) throw notFoundError('No linked user account for this employee');
  const tempPassword = generateTempPassword();
  db.prepare(
    `UPDATE users
     SET password_hash = ?, must_change_password = 1, account_status = 'active',
         token_version = token_version + 1,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(hashPassword(tempPassword), user.id);
  return { temp_password: tempPassword };
}

export function getSecurityInfo(actor, id) {
  const employee = getEmployeeOr404(id);
  const user = db.prepare('SELECT * FROM users WHERE employee_id = ?').get(employee.id);
  if (!user) throw notFoundError('No linked user account for this employee');
  return {
    user_id: user.id,
    employee_id: employee.id,
    login_id: user.login_id,
    email: user.email,
    role: user.role,
    account_status: user.account_status,
    must_change_password: Boolean(user.must_change_password),
    last_login_at: user.last_login_at,
    created_at: user.created_at,
  };
}

export function deleteEmployee(id) {
  const existing = getEmployeeOr404(id);
  db.transaction(() => {
    db.prepare('DELETE FROM users WHERE employee_id = ?').run(existing.id);
    db.prepare('DELETE FROM employees WHERE id = ?').run(existing.id);
  })();
  return { message: 'Employee deleted' };
}
