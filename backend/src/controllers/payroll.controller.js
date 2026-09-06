import { db } from '../config/db.js';
import { resolveUser } from './salary.controller.js';

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function round2(value) {
  return Math.round(value * 100) / 100;
}

function getActiveStructure(userId) {
  let structure = db
    .prepare(
      `SELECT * FROM salary_structures
       WHERE user_id = ? AND end_date IS NULL
       ORDER BY effective_date DESC LIMIT 1`
    )
    .get(userId);

  if (!structure) {
    // Same default template the salary module provisions on first view
    const info = db
      .prepare(
        `INSERT INTO salary_structures (user_id, monthly_wage, basic_rate, hra_rate, pf_rate, fixed_allowance, working_days_per_week, effective_date, end_date)
         VALUES (?, 50000, 0.40, 0.20, 0.12, 20000, 5, datetime('now'), NULL)`
      )
      .run(userId);

    structure = db.prepare('SELECT * FROM salary_structures WHERE id = ?').get(info.lastInsertRowid);
  }

  return structure;
}

export async function generatePayroll(req, res) {
  try {
    const body = req.body || {};
    const period = String(body.pay_period || '').trim();
    if (!PERIOD_PATTERN.test(period)) {
      return res.status(400).json({ detail: 'pay_period must be in YYYY-MM format.' });
    }

    const totalDays = Number(body.total_working_days_in_month);
    if (!Number.isFinite(totalDays) || totalDays < 1 || totalDays > 31) {
      return res.status(400).json({ detail: 'total_working_days_in_month must be between 1 and 31.' });
    }

    const payableDays = body.custom_payable_days === undefined || body.custom_payable_days === null
      ? totalDays
      : Number(body.custom_payable_days);
    if (!Number.isFinite(payableDays) || payableDays < 0 || payableDays > totalDays) {
      return res.status(400).json({
        detail: `custom_payable_days must be between 0 and ${totalDays}.`,
      });
    }

    if (body.employee_id === undefined || body.employee_id === null || `${body.employee_id}`.trim() === '') {
      return res.status(400).json({ detail: 'employee_id is required.' });
    }

    const user = resolveUser(body.employee_id);
    const structure = getActiveStructure(user.id);

    const ratio = totalDays > 0 ? payableDays / totalDays : 0;
    const fullBasic = structure.monthly_wage * structure.basic_rate;
    const fullHra = fullBasic * structure.hra_rate;

    const basic = round2(fullBasic * ratio);
    const hra = round2(fullHra * ratio);
    const fixedAllowance = round2((structure.monthly_wage - (fullBasic + fullHra)) * ratio);
    const grossEarnings = round2(basic + hra + fixedAllowance);
    const pfDeduction = round2(basic * structure.pf_rate);
    const netSalary = round2(grossEarnings - pfDeduction);

    const info = db
      .prepare(
        `INSERT INTO payslips (user_id, pay_period, payable_days, total_working_days, basic, hra, fixed_allowance, gross_earnings, pf_deduction, net_salary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, pay_period) DO UPDATE SET
           payable_days = excluded.payable_days,
           total_working_days = excluded.total_working_days,
           basic = excluded.basic,
           hra = excluded.hra,
           fixed_allowance = excluded.fixed_allowance,
           gross_earnings = excluded.gross_earnings,
           pf_deduction = excluded.pf_deduction,
           net_salary = excluded.net_salary,
           updated_at = datetime('now')`
      )
      .run(
        user.id,
        period,
        payableDays,
        totalDays,
        basic,
        hra,
        fixedAllowance,
        grossEarnings,
        pfDeduction,
        netSalary
      );

    const payslipId = db
      .prepare('SELECT id FROM payslips WHERE user_id = ? AND pay_period = ?')
      .get(user.id, period)?.id ?? info.lastInsertRowid;

    return res.json({
      id: payslipId,
      payslip_id: payslipId,
      employee_id: user.login_id || String(user.id),
      pay_period: period,
      payable_days: payableDays,
      total_working_days_in_month: totalDays,
      gross_earnings: grossEarnings,
      pf_deduction: pfDeduction,
      net_salary: netSalary,
      message: `Official payslip successfully processed for Employee ${user.login_id} (${period})`,
      breakdown: {
        earnings: {
          basic,
          hra,
          fixed_allowance: fixedAllowance,
          gross_earnings: grossEarnings,
        },
        deductions: {
          provident_fund: pfDeduction,
          total_deductions: pfDeduction,
        },
        payable_days: payableDays,
        total_working_days: totalDays,
      },
    });
  } catch (err) {
    return res.status(500).json({ detail: err.message || 'Failed to process payroll.' });
  }
}

export function getPayrollSummary(req, res) {
  const period = String(req.params.period || '').trim();
  if (!PERIOD_PATTERN.test(period)) {
    return res.status(400).json({ detail: 'Pay period must be in YYYY-MM format.' });
  }

  const rows = db
    .prepare(
      `SELECT p.id, p.payable_days, p.total_working_days, p.basic, p.hra,
              p.fixed_allowance, p.gross_earnings, p.pf_deduction, p.net_salary,
              u.login_id
       FROM payslips p
       JOIN users u ON u.id = p.user_id
       WHERE p.pay_period = ?
       ORDER BY u.login_id COLLATE NOCASE`
    )
    .all(period);

  if (!rows.length) {
    return res
      .status(404)
      .json({ detail: `No finalized payslips found for pay period ${period}.` });
  }

  const sum = (pick) => round2(rows.reduce((acc, row) => acc + pick(row), 0));

  return res.json({
    pay_period: period,
    total_employees_paid: rows.length,
    total_net_disbursement: sum((row) => row.net_salary),
    total_gross_earnings: sum((row) => row.gross_earnings),
    total_pf_deductions: sum((row) => row.pf_deduction),
    payslips_audit_list: rows.map((row) => ({
      id: row.id,
      employee_id: row.login_id || '',
      payable_days: row.payable_days,
      total_working_days_in_month: row.total_working_days,
      basic: row.basic,
      hra: row.hra,
      fixed_allowance: row.fixed_allowance,
      gross_earnings: row.gross_earnings,
      pf_deduction: row.pf_deduction,
      net_salary: row.net_salary,
    })),
  });
}
