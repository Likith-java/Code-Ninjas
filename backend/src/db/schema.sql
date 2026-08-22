-- Baseline schema for fresh databases. Incremental changes live in
-- src/db/migrations.js and are applied on every startup, bringing older
-- databases to the same shape without touching existing data.
--
-- NOTE: indexes that reference columns introduced by migrations are created by
-- those migrations only, so this file stays executable against pre-migration
-- databases as well.

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  position TEXT NOT NULL,
  department TEXT NOT NULL,
  company TEXT,
  location TEXT,
  manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  phone TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_leave')),
  employee_code TEXT,
  pan TEXT,
  uan TEXT,
  hired_at TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_last_name ON employees(last_name);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_position ON employees(position COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'hr', 'employee')),
  employee_id INTEGER UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'disabled')),
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS employee_profiles (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  date_of_birth TEXT,
  address TEXT,
  personal_email TEXT,
  gender TEXT,
  nationality TEXT,
  marital_status TEXT,
  about TEXT,
  love_about_job TEXT,
  resume_text TEXT,
  resume_pdf BLOB,
  resume_pdf_name TEXT,
  resume_pdf_size INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (employee_id, name)
);

CREATE INDEX IF NOT EXISTS idx_skills_employee ON skills(employee_id);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS certifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuer TEXT,
  issued_on TEXT,
  expires_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_certifications_employee ON certifications(employee_id);
