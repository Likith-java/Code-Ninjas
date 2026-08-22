import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { bootstrap, cleanup } from './helpers.js';
import { runMigrations } from '../src/db/migrations.js';

let request;
let dbPath;

before(async () => {
  ({ request, dbPath } = await bootstrap());
});

after(() => cleanup(dbPath));

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function indexNames(db, table) {
  return db
    .prepare(`PRAGMA index_list(${table})`)
    .all()
    .map((index) => index.name);
}

test('all migrations are recorded as applied', () => {
  const dbFile = new Database(dbPath, { readonly: true });
  const row = dbFile
    .prepare('SELECT name FROM schema_migrations ORDER BY name')
    .all()
    .map((r) => r.name);
  dbFile.close();
  assert.ok(row.includes('001_add_employee_domain_fields'));
  assert.deepEqual(row, [
    '001_add_employee_domain_fields',
    '002_add_attendance_and_time_off',
    '002_add_users_token_version',
    '003_add_directory_indexes',
    '004_add_profile_bank_details',
  ]);
});

test('employees table carries job fields', () => {
  const dbFile = new Database(dbPath, { readonly: true });
  const columns = columnNames(dbFile, 'employees');
  dbFile.close();

  for (const name of ['company', 'location', 'manager_id']) {
    assert.ok(columns.includes(name), `employees.${name} missing`);
  }
});

test('employees table carries identifiers', () => {
  const dbFile = new Database(dbPath, { readonly: true });
  const columns = columnNames(dbFile, 'employees');
  dbFile.close();

  for (const name of ['employee_code', 'pan', 'uan']) {
    assert.ok(columns.includes(name), `employees.${name} missing`);
  }
});

test('employee_profiles carries personal and profile fields', () => {
  const dbFile = new Database(dbPath, { readonly: true });
  const columns = columnNames(dbFile, 'employee_profiles');
  dbFile.close();

  for (const name of [
    'personal_email',
    'gender',
    'nationality',
    'marital_status',
    'love_about_job',
  ]) {
    assert.ok(columns.includes(name), `employee_profiles.${name} missing`);
  }
});

test('skills and certifications carry created_at timestamps', () => {
  const dbFile = new Database(dbPath, { readonly: true });
  const skillsColumns = columnNames(dbFile, 'skills');
  const certColumns = columnNames(dbFile, 'certifications');
  dbFile.close();

  assert.ok(skillsColumns.includes('created_at'), 'skills.created_at missing');
  assert.ok(certColumns.includes('created_at'), 'certifications.created_at missing');
});

test('users table keeps authentication state intact', () => {
  const dbFile = new Database(dbPath, { readonly: true });
  const columns = columnNames(dbFile, 'users');
  dbFile.close();

  for (const name of [
    'id',
    'login_id',
    'email',
    'password_hash',
    'role',
    'employee_id',
    'must_change_password',
    'account_status',
    'token_version',
    'created_at',
    'updated_at',
  ]) {
    assert.ok(columns.includes(name), `users.${name} missing`);
  }
});

test('search and login indexes exist', () => {
  const dbFile = new Database(dbPath, { readonly: true });
  const employees = indexNames(dbFile, 'employees');
  const users = indexNames(dbFile, 'users');
  const skills = indexNames(dbFile, 'skills');
  const certifications = indexNames(dbFile, 'certifications');
  dbFile.close();

  for (const name of [
    'idx_employees_department',
    'idx_employees_last_name',
    'idx_employees_status',
    'idx_employees_manager_id',
    'idx_employees_employee_code',
    'idx_employees_pan',
    'idx_employees_uan',
    'idx_employees_directory_order',
  ]) {
    assert.ok(employees.includes(name), `index ${name} missing`);
  }
  // UNIQUE constraints on login_id/email create implicit sqlite_autoindex entries
  assert.ok(users.length >= 2, 'expected implicit unique indexes on users');
  assert.ok(skills.includes('idx_skills_name'));
  assert.ok(certifications.includes('idx_certifications_employee'));
});

test('unique constraints reject duplicates but allow sparse NULLs', () => {
  const dbFile = new Database(dbPath);
  const insert = dbFile.prepare(
    `INSERT INTO employees (first_name, last_name, email, position, department,
       employee_code, pan, uan)
     VALUES ('Dup', 'Test', ?, 'Engineer', 'Engineering', ?, ?, ?)`
  );

  insert.run('dup.a@dayflow.io', 'EMP0001', 'PAN0001A', 'UAN0001');
  assert.throws(() => insert.run('dup.b@dayflow.io', 'EMP0001', null, null), /UNIQUE/);
  assert.throws(() => insert.run('dup.c@dayflow.io', null, 'PAN0001A', null), /UNIQUE/);
  assert.throws(() => insert.run('dup.d@dayflow.io', null, null, 'UAN0001'), /UNIQUE/);

  // case-insensitive uniqueness for codes/PAN
  assert.throws(
    () => insert.run('dup.e@dayflow.io', 'emp0001', 'pan0001a', null),
    /UNIQUE/
  );

  // multiple NULLs remain allowed
  insert.run('dup.f@dayflow.io', null, null, null);
  insert.run('dup.g@dayflow.io', null, null, null);

  const total = dbFile
    .prepare("SELECT COUNT(*) AS count FROM employees WHERE email LIKE 'dup.%@dayflow.io'")
    .get().count;
  dbFile.close();
  assert.equal(total, 3);
});

test('manager_id supports self-referencing hierarchy with ON DELETE SET NULL', () => {
  const dbFile = new Database(dbPath);
  const insertEmployee = dbFile.prepare(
    `INSERT INTO employees (first_name, last_name, email, position, department)
     VALUES (?, ?, ?, 'Engineer', 'Engineering')`
  );

  const manager = insertEmployee.run('Mana', 'Gerself', 'mana.gerself@dayflow.test');
  const report = insertEmployee.run('Repo', 'Rtings', 'repo.rtings@dayflow.test');

  dbFile.prepare('UPDATE employees SET manager_id = ? WHERE id = ?').run(
    manager.lastInsertRowid,
    report.lastInsertRowid
  );
  const linked = dbFile
    .prepare('SELECT manager_id FROM employees WHERE id = ?')
    .get(report.lastInsertRowid);
  assert.equal(Number(linked.manager_id), Number(manager.lastInsertRowid));

  // invalid manager reference must be rejected
  assert.throws(
    () =>
      dbFile
        .prepare('UPDATE employees SET manager_id = 999999 WHERE id = ?')
        .run(report.lastInsertRowid),
    /FOREIGN KEY/
  );

  // deleting the manager clears the reference instead of removing the report
  dbFile.prepare('DELETE FROM employees WHERE id = ?').run(manager.lastInsertRowid);
  const orphaned = dbFile
    .prepare('SELECT manager_id FROM employees WHERE id = ?')
    .get(report.lastInsertRowid);
  assert.equal(orphaned.manager_id, null);
  dbFile.close();
});

test('skills and certifications cascade with their employee', () => {
  const dbFile = new Database(dbPath);
  const employee = dbFile
    .prepare(
      `INSERT INTO employees (first_name, last_name, email, position, department)
       VALUES ('Casc', 'Ader', 'casc.ader@dayflow.test', 'Engineer', 'Engineering')`
    )
    .run();
  const employeeId = employee.lastInsertRowid;
  dbFile.prepare('INSERT INTO skills (employee_id, name) VALUES (?, ?)').run(employeeId, 'Testing');
  dbFile
    .prepare('INSERT INTO certifications (employee_id, name, issuer) VALUES (?, ?, ?)')
    .run(employeeId, 'Cert A', 'Issuer');

  dbFile.prepare('DELETE FROM employees WHERE id = ?').run(employeeId);

  assert.equal(dbFile.prepare('SELECT COUNT(*) AS c FROM skills WHERE employee_id = ?').get(employeeId).c, 0);
  assert.equal(
    dbFile.prepare('SELECT COUNT(*) AS c FROM certifications WHERE employee_id = ?').get(employeeId).c,
    0
  );
  dbFile.close();
});

test('seeded skill rows receive created_at values', () => {
  const dbFile = new Database(dbPath, { readonly: true });
  const rows = dbFile
    .prepare('SELECT COUNT(*) AS c FROM skills WHERE created_at IS NULL')
    .get();
  dbFile.close();
  assert.equal(rows.c, 0);
});

const LEGACY_SCHEMA = `
CREATE TABLE employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  position TEXT NOT NULL,
  department TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave')),
  hired_at TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_employees_department ON employees(department);
CREATE INDEX idx_employees_last_name ON employees(last_name);
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'hr', 'employee')),
  employee_id INTEGER UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'disabled')),
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE employee_profiles (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  date_of_birth TEXT,
  address TEXT,
  about TEXT,
  resume_text TEXT,
  resume_pdf BLOB,
  resume_pdf_name TEXT,
  resume_pdf_size INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (employee_id, name)
);
CREATE INDEX idx_skills_employee ON skills(employee_id);
CREATE INDEX idx_skills_name ON skills(name COLLATE NOCASE);
CREATE TABLE certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  issued_on TEXT,
  expires_on TEXT
);
CREATE INDEX idx_certifications_employee ON certifications(employee_id);
`;

test('legacy databases are upgraded in place without data loss', () => {
  const legacyPath = path.join(os.tmpdir(), `dayflow-legacy-${Date.now()}.db`);
  const legacy = new Database(legacyPath);
  legacy.pragma('foreign_keys = ON');
  legacy.exec(LEGACY_SCHEMA);

  const employee = legacy
    .prepare(
      `INSERT INTO employees (first_name, last_name, email, position, department)
       VALUES ('Legacy', 'Row', 'legacy.row@dayflow.test', 'Engineer', 'Engineering')`
    )
    .run();
  const employeeId = Number(employee.lastInsertRowid);
  legacy
    .prepare(
      `INSERT INTO employee_profiles (employee_id, date_of_birth, address, about)
       VALUES (?, '1990-01-01', '12 Old Road', 'Pre-migration about')`
    )
    .run(employeeId);
  const skillIds = [1, 2].map((i) =>
    Number(
      legacy.prepare('INSERT INTO skills (employee_id, name) VALUES (?, ?)').run(employeeId, `Skill ${i}`)
        .lastInsertRowid
    )
  );
  legacy
    .prepare(
      `INSERT INTO certifications (employee_id, name, issuer, issued_on, expires_on)
       VALUES (?, 'Old Cert', 'Issuer X', '2020-01-01', '2024-01-01')`
    )
    .run(employeeId);
  legacy.close();

  const upgraded = new Database(legacyPath);
  upgraded.pragma('foreign_keys = ON');
  const appliedTwice = [...runMigrations(upgraded), ...runMigrations(upgraded)];
  upgraded.close();

  assert.deepEqual(appliedTwice.filter((n) => n === '001_add_employee_domain_fields').length, 1);

  const dbFile = new Database(legacyPath, { readonly: true });
  try {
    const employeeColumns = columnNames(dbFile, 'employees');
    for (const name of ['company', 'location', 'manager_id', 'employee_code', 'pan', 'uan']) {
      assert.ok(employeeColumns.includes(name), `upgraded employees.${name} missing`);
    }

    const profile = dbFile
      .prepare('SELECT * FROM employee_profiles WHERE employee_id = ?')
      .get(employeeId);
    assert.equal(profile.about, 'Pre-migration about');
    assert.equal(profile.date_of_birth, '1990-01-01');
    assert.equal(profile.address, '12 Old Road');

    const skills = dbFile
      .prepare('SELECT id, name, created_at FROM skills WHERE employee_id = ? ORDER BY id')
      .all(employeeId);
    assert.equal(skills.length, 2);
    assert.deepEqual(
      skills.map((s) => s.id),
      skillIds
    );
    assert.equal(skills[0].name, 'Skill 1');
    assert.ok(skills.every((s) => s.created_at), 'skills.created_at not populated');

    const cert = dbFile
      .prepare(
        'SELECT name, issuer, issued_on, expires_on, created_at FROM certifications WHERE employee_id = ?'
      )
      .get(employeeId);
    assert.equal(cert.name, 'Old Cert');
    assert.equal(cert.issuer, 'Issuer X');
    assert.equal(cert.issued_on, '2020-01-01');
    assert.equal(cert.expires_on, '2024-01-01');
    assert.ok(cert.created_at, 'certifications.created_at not populated');

    const indexes = indexNames(dbFile, 'employees');
    for (const name of ['idx_employees_manager_id', 'idx_employees_employee_code', 'idx_employees_pan', 'idx_employees_uan']) {
      assert.ok(indexes.includes(name), `index ${name} missing after upgrade`);
    }
  } finally {
    dbFile.close();
    cleanup(legacyPath);
  }
});
