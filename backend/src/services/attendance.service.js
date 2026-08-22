import { db } from '../config/db.js';

export function getAttendanceRecords({ employeeId, startDate, endDate, month }) {
  let query = `
    SELECT a.*, e.first_name, e.last_name, e.department, e.email as employee_email
    FROM attendance_records a
    JOIN employees e ON a.employee_id = e.id
    WHERE 1=1
  `;
  const params = [];

  if (employeeId) {
    query += ` AND a.employee_id = ?`;
    params.push(employeeId);
  }

  if (startDate && endDate) {
    query += ` AND a.date >= ? AND a.date <= ?`;
    params.push(startDate, endDate);
  } else if (month) {
    query += ` AND a.date LIKE ?`;
    params.push(`${month}%`);
  }

  query += ` ORDER BY a.date DESC`;
  return db.prepare(query).all(...params);
}

export function getAttendanceSummary({ employeeId, startDate, endDate }) {
  const empId = Number(employeeId);
  
  // Date range defaults to current month if not provided
  let start = startDate;
  let end = endDate;
  if (!start || !end) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    start = `${year}-${month}-01`;
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  }

  // Attendance metrics query
  const records = db.prepare(`
    SELECT status, check_in_time, check_out_time
    FROM attendance_records
    WHERE employee_id = ? AND date >= ? AND date <= ?
  `).all(empId, start, end);

  let presentCount = 0;
  let missingCheckOuts = 0;

  for (const r of records) {
    if (r.status === 'PRESENT') presentCount += 1;
    else if (r.status === 'HALF_DAY') presentCount += 0.5;

    if (r.check_in_time && !r.check_out_time) {
      missingCheckOuts += 1;
    }
  }

  // Approved leave metrics from time_off_requests
  const leaves = db.prepare(`
    SELECT type, SUM(days) as total_days
    FROM time_off_requests
    WHERE employee_id = ? AND status = 'APPROVED'
      AND ((start_date >= ? AND start_date <= ?) OR (end_date >= ? AND end_date <= ?))
    GROUP BY type
  `).all(empId, start, end, start, end);

  let approvedPaidLeaves = 0;
  let approvedUnpaidLeaves = 0;

  for (const l of leaves) {
    if (l.type === 'PAID' || l.type === 'SICK') {
      approvedPaidLeaves += (l.total_days || 0);
    } else if (l.type === 'UNPAID') {
      approvedUnpaidLeaves += (l.total_days || 0);
    }
  }

  return {
    employeeId: String(employeeId),
    period: {
      start,
      end,
    },
    metrics: {
      daysPresent: presentCount,
      approvedPaidLeaves,
      approvedUnpaidLeaves,
      missingCheckOuts,
    },
  };
}

export function checkIn({ employeeId, date, time, notes }) {
  const empId = Number(employeeId);
  const recordDate = date || new Date().toISOString().split('T')[0];
  const checkInTime = time || new Date().toISOString();

  const existing = db.prepare(`
    SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?
  `).get(empId, recordDate);

  if (existing) {
    db.prepare(`
      UPDATE attendance_records
      SET check_in_time = ?, check_out_time = NULL, status = 'PRESENT', updated_at = datetime('now')
      WHERE id = ?
    `).run(checkInTime, existing.id);
    return db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(existing.id);
  }

  const result = db.prepare(`
    INSERT INTO attendance_records (employee_id, date, status, check_in_time, check_out_time, work_hours, extra_hours, notes)
    VALUES (?, ?, 'PRESENT', ?, NULL, 0, 0, ?)
  `).run(empId, recordDate, checkInTime, notes || null);

  return db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(result.lastInsertRowid);
}

export function checkOut({ employeeId, date, time }) {
  const empId = Number(employeeId);
  const recordDate = date || new Date().toISOString().split('T')[0];
  const checkOutTime = time || new Date().toISOString();

  const record = db.prepare(`
    SELECT * FROM attendance_records WHERE employee_id = ? AND date = ?
  `).get(empId, recordDate);

  if (!record) {
    const result = db.prepare(`
      INSERT INTO attendance_records (employee_id, date, status, check_in_time, check_out_time, work_hours, extra_hours)
      VALUES (?, ?, 'PRESENT', NULL, ?, 0, 0)
    `).run(empId, recordDate, checkOutTime);
    return db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(result.lastInsertRowid);
  }

  let workHours = 0;
  let extraHours = 0;

  if (record.check_in_time) {
    const startMs = new Date(record.check_in_time).getTime();
    const endMs = new Date(checkOutTime).getTime();
    const diffHours = Math.max(0, (endMs - startMs) / (1000 * 60 * 60));
    workHours = Math.round(diffHours * 10) / 10;
    extraHours = Math.max(0, Math.round((workHours - 8) * 10) / 10);
  }

  db.prepare(`
    UPDATE attendance_records
    SET check_out_time = ?, work_hours = ?, extra_hours = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(checkOutTime, workHours, extraHours, record.id);

  return db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(record.id);
}
