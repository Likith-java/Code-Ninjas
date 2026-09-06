import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { db } from './config/db.js';

const EMPLOYEES = [
  {
    first_name: 'Richard A.',
    last_name: 'Bachmann',
    email: 'richard.bachmann@dayflow.io',
    position: 'UI/UX Designer',
    department: 'Design',
    hired_at: '2021-03-15',
  },
  {
    first_name: 'Jenifer',
    last_name: 'Smith',
    email: 'jenifer.smith@dayflow.io',
    position: 'Product Manager',
    department: 'Product',
    hired_at: '2020-08-01',
  },
  {
    first_name: 'Michael',
    last_name: 'Doe',
    email: 'michael.doe@dayflow.io',
    position: 'Frontend Developer',
    department: 'Engineering',
    hired_at: '2022-04-11',
  },
  {
    first_name: 'Sarah',
    last_name: 'Connor',
    email: 'sarah.connor@dayflow.io',
    position: 'HR Specialist',
    department: 'Human Resources',
    hired_at: '2023-01-09',
  },
  {
    first_name: 'David',
    last_name: 'Lee',
    email: 'david.lee@dayflow.io',
    position: 'Backend Developer',
    department: 'Engineering',
    hired_at: '2022-09-05',
  },
  {
    first_name: 'Emily',
    last_name: 'Chen',
    email: 'emily.chen@dayflow.io',
    position: 'Marketing Manager',
    department: 'Marketing',
    hired_at: '2024-02-19',
  },
  {
    first_name: 'System',
    last_name: 'Administrator',
    email: 'admin@dayflow.com',
    position: 'System Administrator',
    department: 'Engineering',
    hired_at: '2020-01-15',
  },
];

const USERS = [
  {
    login_id: 'ADUS20200001',
    email: 'admin@dayflow.com',
    password: 'Admin@123',
    role: 'admin',
    employeeEmail: 'admin@dayflow.com',
  },
  {
    login_id: 'SACO20230001',
    email: 'hr@dayflow.com',
    password: 'Hr@123456',
    role: 'hr',
    employeeEmail: 'sarah.connor@dayflow.io',
  },
  {
    login_id: 'MIDO20220001',
    email: 'employee@dayflow.com',
    password: 'Employee@123',
    role: 'employee',
    employeeEmail: 'michael.doe@dayflow.io',
  },
];

const PROFILES = [
  {
    email: 'admin@dayflow.com',
    about: 'System Administrator managing the Dayflow HRMS platform.',
    skills: ['System Administration', 'Security Operations', 'Database Management', 'Access Control'],
    certifications: [{ name: 'Certified Information Systems Security Professional (CISSP)', issuer: 'ISC2', issued_on: '2021-01-10', expires_on: null }],
  },
  {
    email: 'michael.doe@dayflow.io',
    about: 'Frontend developer focused on React and design systems.',
    skills: ['React', 'JavaScript', 'CSS', 'Accessibility'],
    certifications: [{ name: 'Meta Front-End Developer', issuer: 'Coursera', issued_on: '2023-06-01', expires_on: null }],
  },
  {
    email: 'sarah.connor@dayflow.io',
    about: 'HR specialist handling onboarding and people operations.',
    skills: ['Recruiting', 'Onboarding', 'Employee Relations'],
    certifications: [{ name: 'SHRM-CP', issuer: 'SHRM', issued_on: '2022-05-20', expires_on: '2025-05-20' }],
  },
  {
    email: 'david.lee@dayflow.io',
    about: null,
    skills: ['Node.js', 'SQLite', 'REST APIs'],
    certifications: [],
  },
];

export function seed() {
  const insertEmployee = db.prepare(
    `INSERT INTO employees (first_name, last_name, email, position, department, hired_at)
     VALUES (@first_name, @last_name, @email, @position, @department, @hired_at)`
  );

  db.transaction(() => {
    for (const e of EMPLOYEES) {
      const existing = db.prepare('SELECT id FROM employees WHERE email = ? COLLATE NOCASE').get(e.email);
      if (!existing) insertEmployee.run(e);
    }
  })();

  const upsertUser = db.prepare(
    `INSERT INTO users (login_id, email, password_hash, role, employee_id, must_change_password)
     VALUES (@login_id, @email, @password_hash, @role,
             (SELECT id FROM employees WHERE email = @employee_email), 0)
     ON CONFLICT(email) DO NOTHING`
  );

  db.transaction(() => {
    for (const u of USERS) {
      upsertUser.run({
        login_id: u.login_id,
        email: u.email,
        password_hash: bcrypt.hashSync(u.password, 10),
        role: u.role,
        employee_email: u.employeeEmail,
      });

      if (u.employeeEmail) {
        db.prepare(
          `UPDATE users SET employee_id = (SELECT id FROM employees WHERE email = ?) WHERE email = ?`
        ).run(u.employeeEmail, u.email);
      }
    }
  })();

  const upsertProfile = db.prepare(
    `INSERT INTO employee_profiles (employee_id, about)
     VALUES ((SELECT id FROM employees WHERE email = @email), @about)
     ON CONFLICT(employee_id) DO NOTHING`
  );
  const insertSkill = db.prepare(
    `INSERT OR IGNORE INTO skills (employee_id, name)
     VALUES ((SELECT id FROM employees WHERE email = @email), @name)`
  );
  const insertCertification = db.prepare(
    `INSERT INTO certifications (employee_id, name, issuer, issued_on, expires_on)
     VALUES ((SELECT id FROM employees WHERE email = @email), @name, @issuer, @issued_on, @expires_on)`
  );

  db.transaction(() => {
    for (const p of PROFILES) {
      upsertProfile.run({ email: p.email, about: p.about });
      for (const name of p.skills) insertSkill.run({ email: p.email, name });
      for (const c of p.certifications) insertCertification.run({ email: p.email, ...c });
    }
  })();

  const insertAttendance = db.prepare(`
    INSERT OR IGNORE INTO attendance_records (employee_id, date, status, check_in_time, check_out_time, work_hours, extra_hours, notes)
    VALUES (@employee_id, @date, @status, @check_in_time, @check_out_time, @work_hours, @extra_hours, @notes)
  `);

  const insertTimeOff = db.prepare(`
    INSERT OR IGNORE INTO time_off_requests (employee_id, type, start_date, end_date, days, reason, status)
    VALUES (@employee_id, @type, @start_date, @end_date, @days, @reason, @status)
  `);

  const employees = db.prepare('SELECT id, email FROM employees').all();
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');

  db.transaction(() => {
    for (const emp of employees) {
      // Seed sample attendance for the current month
      insertAttendance.run({
        employee_id: emp.id,
        date: `${currentYear}-${currentMonth}-01`,
        status: 'PRESENT',
        check_in_time: `${currentYear}-${currentMonth}-01T09:00:00Z`,
        check_out_time: `${currentYear}-${currentMonth}-01T17:30:00Z`,
        work_hours: 8.5,
        extra_hours: 0.5,
        notes: 'Regular on-time shift',
      });
      insertAttendance.run({
        employee_id: emp.id,
        date: `${currentYear}-${currentMonth}-02`,
        status: 'PRESENT',
        check_in_time: `${currentYear}-${currentMonth}-02T09:15:00Z`,
        check_out_time: null, // missing checkout demonstration
        work_hours: 0,
        extra_hours: 0,
        notes: 'Forgot evening punch',
      });
      insertAttendance.run({
        employee_id: emp.id,
        date: `${currentYear}-${currentMonth}-03`,
        status: 'HALF_DAY',
        check_in_time: `${currentYear}-${currentMonth}-03T09:00:00Z`,
        check_out_time: `${currentYear}-${currentMonth}-03T13:00:00Z`,
        work_hours: 4.0,
        extra_hours: 0,
        notes: 'Half day afternoon leave',
      });

      // Seed sample time off requests
      insertTimeOff.run({
        employee_id: emp.id,
        type: 'PAID',
        start_date: `${currentYear}-${currentMonth}-10`,
        end_date: `${currentYear}-${currentMonth}-12`,
        days: 3,
        reason: 'Annual personal time off',
        status: 'APPROVED',
      });
      insertTimeOff.run({
        employee_id: emp.id,
        type: 'UNPAID',
        start_date: `${currentYear}-${currentMonth}-20`,
        end_date: `${currentYear}-${currentMonth}-21`,
        days: 2,
        reason: 'Personal urgent relocation',
        status: 'PENDING',
      });
    }
  })();

  console.log('Seed complete. Demo accounts:');
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(8)} ${u.email} / ${u.login_id} / ${u.password}`);
  }
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  seed();
}
