import { db } from '../config/db.js';

export function getTimeOffRequests({ employeeId, status }) {
  let query = `
    SELECT r.*, e.first_name, e.last_name, e.department, e.email as employee_email,
           u.email as reviewer_email
    FROM time_off_requests r
    JOIN employees e ON r.employee_id = e.id
    LEFT JOIN users u ON r.reviewed_by = u.id
    WHERE 1=1
  `;
  const params = [];

  if (employeeId) {
    query += ` AND r.employee_id = ?`;
    params.push(employeeId);
  }

  if (status && status !== 'ALL') {
    query += ` AND r.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY r.created_at DESC, r.id DESC`;
  return db.prepare(query).all(...params);
}

export function createTimeOffRequest({ employeeId, type, startDate, endDate, days, reason }) {
  const empId = Number(employeeId);

  // Auto-calculate days if not explicitly provided
  let durationDays = days;
  if (!durationDays) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    durationDays = Math.max(1, Math.ceil(Math.abs(e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  }

  const result = db.prepare(`
    INSERT INTO time_off_requests (employee_id, type, start_date, end_date, days, reason, status)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
  `).run(empId, type, startDate, endDate, durationDays, reason);

  return db.prepare(`
    SELECT r.*, e.first_name, e.last_name, e.department, e.email as employee_email
    FROM time_off_requests r
    JOIN employees e ON r.employee_id = e.id
    WHERE r.id = ?
  `).get(result.lastInsertRowid);
}

export function updateTimeOffStatus({ id, status, reviewerId, rejectionReason }) {
  const reqId = Number(id);
  const reviewedAt = new Date().toISOString().split('T')[0];

  const request = db.prepare('SELECT * FROM time_off_requests WHERE id = ?').get(reqId);
  if (!request) return null;

  db.prepare(`
    UPDATE time_off_requests
    SET status = ?, reviewed_by = ?, reviewed_at = ?, rejection_reason = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, reviewerId || null, reviewedAt, rejectionReason || null, reqId);

  return db.prepare(`
    SELECT r.*, e.first_name, e.last_name, e.department, e.email as employee_email,
           u.email as reviewer_email
    FROM time_off_requests r
    JOIN employees e ON r.employee_id = e.id
    LEFT JOIN users u ON r.reviewed_by = u.id
    WHERE r.id = ?
  `).get(reqId);
}
