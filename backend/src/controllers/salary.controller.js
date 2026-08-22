import { db } from '../config/db.js';

function resolveUser(employeeId) {
  const empStr = String(employeeId).trim();
  let user = null;

  if (/^\d+$/.test(empStr)) {
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(empStr, 10));
  }
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE login_id = ? COLLATE NOCASE').get(empStr);
  }
  if (!user && /^\d+$/.test(empStr)) {
    user = db.prepare('SELECT * FROM users WHERE employee_id = ?').get(parseInt(empStr, 10));
  }

  // If user doesn't exist, create mock employee/user record so salary configuration works smoothly
  if (!user) {
    const isNum = /^\d+$/.test(empStr);
    const loginId = isNum ? `EMP${empStr.padStart(4, '0')}` : empStr;
    const email = `${loginId.toLowerCase()}@dayflow.com`;

    const info = db
      .prepare(
        `INSERT INTO users (login_id, email, password_hash, role, must_change_password, account_status)
         VALUES (?, ?, 'dummy_hash', 'employee', 0, 'active')`
      )
      .run(loginId, email);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }

  return user;
}

export function getSalaryStructure(req, res) {
  const { employeeId } = req.params;
  const user = resolveUser(employeeId);

  let structure = db
    .prepare(
      `SELECT * FROM salary_structures 
       WHERE user_id = ? AND end_date IS NULL 
       ORDER BY effective_date DESC LIMIT 1`
    )
    .get(user.id);

  if (!structure) {
    // Default initial template
    const info = db
      .prepare(
        `INSERT INTO salary_structures (user_id, monthly_wage, basic_rate, hra_rate, pf_rate, fixed_allowance, working_days_per_week, effective_date, end_date)
         VALUES (?, 50000, 0.40, 0.20, 0.12, 20000, 5, datetime('now'), NULL)`
      )
      .run(user.id);

    structure = db.prepare('SELECT * FROM salary_structures WHERE id = ?').get(info.lastInsertRowid);
  }

  return res.json({
    id: structure.id,
    employee_id: user.login_id || String(user.id),
    monthly_wage: structure.monthly_wage,
    basic_rate: structure.basic_rate,
    hra_rate: structure.hra_rate,
    pf_rate: structure.pf_rate,
    fixed_allowance: structure.fixed_allowance,
    working_days_per_week: structure.working_days_per_week,
    effective_date: structure.effective_date,
    end_date: structure.end_date,
  });
}

export function getSalaryHistory(req, res) {
  const { employeeId } = req.params;
  const user = resolveUser(employeeId);

  const records = db
    .prepare(
      `SELECT * FROM salary_structures 
       WHERE user_id = ? 
       ORDER BY effective_date DESC`
    )
    .all(user.id);

  return res.json(
    records.map((r) => ({
      id: r.id,
      employee_id: user.login_id || String(user.id),
      monthly_wage: r.monthly_wage,
      basic_rate: r.basic_rate,
      hra_rate: r.hra_rate,
      pf_rate: r.pf_rate,
      fixed_allowance: r.fixed_allowance,
      working_days_per_week: r.working_days_per_week,
      effective_date: r.effective_date,
      end_date: r.end_date,
    }))
  );
}

export function listSalaryStructures(_req, res) {
  const records = db
    .prepare(
      `SELECT s.*, u.login_id 
       FROM salary_structures s
       JOIN users u ON s.user_id = u.id
       WHERE s.end_date IS NULL
       ORDER BY s.effective_date DESC`
    )
    .all();

  return res.json(
    records.map((r) => ({
      id: r.id,
      employee_id: r.login_id || String(r.user_id),
      monthly_wage: r.monthly_wage,
      basic_rate: r.basic_rate,
      hra_rate: r.hra_rate,
      pf_rate: r.pf_rate,
      fixed_allowance: r.fixed_allowance,
      working_days_per_week: r.working_days_per_week,
      effective_date: r.effective_date,
      end_date: r.end_date,
    }))
  );
}

export function updateSalaryStructure(req, res) {
  const { employeeId } = req.params;
  const { monthly_wage, basic_rate, hra_rate, pf_rate, working_days_per_week = 5 } = req.body;

  const wage = parseFloat(monthly_wage);
  const bRate = parseFloat(basic_rate);
  const hRate = parseFloat(hra_rate);
  const pRate = parseFloat(pf_rate);
  const days = parseInt(working_days_per_week, 10) || 5;

  if (isNaN(wage) || wage <= 0) {
    return res.status(400).json({ detail: 'Monthly gross wage must be greater than 0.' });
  }

  const basicSalary = Math.round(wage * bRate * 100) / 100;
  const hra = Math.round(basicSalary * hRate * 100) / 100;
  const fixedAllowance = Math.round((wage - (basicSalary + hra)) * 100) / 100;

  if (fixedAllowance < 0) {
    return res.status(400).json({
      detail: 'Component total exceeds Monthly Wage. Fixed Allowance cannot be negative.',
    });
  }

  const user = resolveUser(employeeId);

  // Close previous active record
  db.prepare(
    `UPDATE salary_structures 
     SET end_date = datetime('now') 
     WHERE user_id = ? AND end_date IS NULL`
  ).run(user.id);

  // Insert new versioned record
  const info = db
    .prepare(
      `INSERT INTO salary_structures (user_id, monthly_wage, basic_rate, hra_rate, pf_rate, fixed_allowance, working_days_per_week, effective_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL)`
    )
    .run(user.id, wage, bRate, hRate, pRate, fixedAllowance, days);

  const newRecord = db.prepare('SELECT * FROM salary_structures WHERE id = ?').get(info.lastInsertRowid);

  return res.status(200).json({
    id: newRecord.id,
    employee_id: user.login_id || String(user.id),
    monthly_wage: newRecord.monthly_wage,
    basic_rate: newRecord.basic_rate,
    hra_rate: newRecord.hra_rate,
    pf_rate: newRecord.pf_rate,
    fixed_allowance: newRecord.fixed_allowance,
    working_days_per_week: newRecord.working_days_per_week,
    effective_date: newRecord.effective_date,
    end_date: newRecord.end_date,
  });
}
