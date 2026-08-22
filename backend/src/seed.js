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
  },
  {
    first_name: 'Jenifer',
    last_name: 'Smith',
    email: 'jenifer.smith@dayflow.io',
    position: 'Product Manager',
    department: 'Product',
  },
  {
    first_name: 'Michael',
    last_name: 'Doe',
    email: 'michael.doe@dayflow.io',
    position: 'Frontend Developer',
    department: 'Engineering',
  },
  {
    first_name: 'Sarah',
    last_name: 'Connor',
    email: 'sarah.connor@dayflow.io',
    position: 'HR Specialist',
    department: 'Human Resources',
  },
  {
    first_name: 'David',
    last_name: 'Lee',
    email: 'david.lee@dayflow.io',
    position: 'Backend Developer',
    department: 'Engineering',
  },
  {
    first_name: 'Emily',
    last_name: 'Chen',
    email: 'emily.chen@dayflow.io',
    position: 'Marketing Manager',
    department: 'Marketing',
  },
];

const USERS = [
  { email: 'admin@dayflow.com', password: 'Admin@123', role: 'admin', employeeEmail: null },
  { email: 'hr@dayflow.com', password: 'Hr@123456', role: 'hr', employeeEmail: 'sarah.connor@dayflow.io' },
  { email: 'employee@dayflow.com', password: 'Employee@123', role: 'employee', employeeEmail: 'michael.doe@dayflow.io' },
];

export function seed() {
  const employeeCount = db.prepare('SELECT COUNT(*) AS count FROM employees').get().count;

  if (employeeCount === 0) {
    const insertEmployee = db.prepare(
      `INSERT INTO employees (first_name, last_name, email, position, department)
       VALUES (@first_name, @last_name, @email, @position, @department)`
    );
    db.transaction(() => {
      for (const e of EMPLOYEES) insertEmployee.run(e);
    })();
    console.log(`Seeded ${EMPLOYEES.length} employees`);
  }

  const upsertUser = db.prepare(
    `INSERT INTO users (email, password_hash, role, employee_id)
     VALUES (@email, @password_hash, @role,
             (SELECT id FROM employees WHERE email = @employee_email))
     ON CONFLICT(email) DO NOTHING`
  );

  db.transaction(() => {
    for (const u of USERS) {
      upsertUser.run({
        email: u.email,
        password_hash: bcrypt.hashSync(u.password, 10),
        role: u.role,
        employee_email: u.employeeEmail,
      });
    }
  })();

  console.log('Seed complete. Demo accounts:');
  for (const u of USERS) console.log(`  ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
}

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  seed();
}
