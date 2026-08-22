import { db } from '../config/db.js';

const DEPARTMENTS = ['Design', 'Product', 'Engineering', 'Human Resources', 'Marketing', 'Finance'];
const STATUSES = ['active', 'on_leave'];

function publicEmployee(row) {
  if (!row) return row;
  const {
    id,
    first_name,
    last_name,
    email,
    position,
    department,
    phone,
    avatar_url,
    status,
    hired_at,
    created_at,
    updated_at,
  } = row;
  return {
    id,
    first_name,
    last_name,
    full_name: `${first_name} ${last_name}`,
    email,
    position,
    department,
    phone,
    avatar_url,
    status,
    hired_at,
    created_at,
    updated_at,
  };
}

function validateEmployee(body, { partial = false, currentId = null } = {}) {
  const errors = [];
  const str = (v) => (typeof v === 'string' ? v.trim() : v);

  const fields = {
    first_name: str(body.first_name),
    last_name: str(body.last_name),
    email: str(body.email),
    position: str(body.position),
    department: str(body.department),
    phone: str(body.phone) ?? null,
    avatar_url: str(body.avatar_url) ?? null,
    status: body.status === undefined ? 'active' : body.status,
  };

  for (const key of ['first_name', 'last_name', 'email', 'position', 'department']) {
    if (!fields[key]) errors.push({ field: key, message: `${key} is required` });
  }
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    errors.push({ field: 'email', message: 'Email is not valid' });
  }
  if (fields.department && !DEPARTMENTS.includes(fields.department)) {
    errors.push({
      field: 'department',
      message: `Department must be one of: ${DEPARTMENTS.join(', ')}`,
    });
  }
  if (fields.status !== undefined && !STATUSES.includes(fields.status)) {
    errors.push({ field: 'status', message: `Status must be one of: ${STATUSES.join(', ')}` });
  }
  if (fields.phone && !/^[+\d][\d\s\-()]{5,20}$/.test(fields.phone)) {
    errors.push({ field: 'phone', message: 'Phone number is not valid' });
  }

  if (fields.email && errors.length === 0) {
    const existing = db
      .prepare('SELECT id FROM employees WHERE email = ? COLLATE NOCASE AND id != ?')
      .get(fields.email, currentId ?? -1);
    if (existing) errors.push({ field: 'email', message: 'Email is already in use' });
  }

  return { errors, fields };
}

export function listEmployees(req, res, next) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const department =
      typeof req.query.department === 'string' && req.query.department !== 'All'
        ? req.query.department
        : null;
    const status = ['active', 'on_leave'].includes(req.query.status)
      ? req.query.status
      : null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    if (q) {
      conditions.push(
        '(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR position LIKE ?)'
      );
      const like = `%${q}%`;
      params.push(like, like, like, like);
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

    const total = db
      .prepare(`SELECT COUNT(*) AS count FROM employees ${where}`)
      .get(...params).count;
    const rows = db
      .prepare(
        `SELECT * FROM employees ${where} ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    return res.json({
      data: rows.map(publicEmployee),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    return next(err);
  }
}

export function getEmployee(req, res, next) {
  try {
    const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: { message: 'Employee not found' } });
    return res.json({ data: publicEmployee(row) });
  } catch (err) {
    return next(err);
  }
}

export function createEmployee(req, res, next) {
  try {
    const { errors, fields } = validateEmployee(req.body || {});
    if (errors.length) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors } });
    }
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
        hired_at: strOrNull(req.body?.hired_at),
      });
    const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
    return res.status(201).json({ data: publicEmployee(row) });
  } catch (err) {
    return next(err);
  }
}

export function updateEmployee(req, res, next) {
  try {
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: { message: 'Employee not found' } });

    const merged = { ...existing, ...(req.body || {}) };
    const { errors, fields } = validateEmployee(merged, { partial: true, currentId: existing.id });
    if (errors.length) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors } });
    }

    db.prepare(
      `UPDATE employees
       SET first_name = @first_name, last_name = @last_name, email = @email, position = @position,
           department = @department, phone = @phone, avatar_url = @avatar_url, status = @status,
           updated_at = datetime('now')
       WHERE id = @id`
    ).run({
      id: existing.id,
      first_name: fields.first_name ?? existing.first_name,
      last_name: fields.last_name ?? existing.last_name,
      email: (fields.email ?? existing.email).toLowerCase(),
      position: fields.position ?? existing.position,
      department: fields.department ?? existing.department,
      phone: fields.phone,
      avatar_url: fields.avatar_url,
      status: fields.status ?? 'active',
    });

    const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(existing.id);
    return res.json({ data: publicEmployee(row) });
  } catch (err) {
    return next(err);
  }
}

export function deleteEmployee(req, res, next) {
  try {
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: { message: 'Employee not found' } });
    db.prepare('DELETE FROM users WHERE employee_id = ?').run(existing.id);
    db.prepare('DELETE FROM employees WHERE id = ?').run(existing.id);
    return res.json({ data: { message: 'Employee deleted' } });
  } catch (err) {
    return next(err);
  }
}

export function listMeta(_req, res) {
  return res.json({ data: { departments: DEPARTMENTS, statuses: STATUSES } });
}

function strOrNull(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}
