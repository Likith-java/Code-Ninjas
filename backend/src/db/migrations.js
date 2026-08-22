const MIGRATIONS = [
  {
    name: '001_add_employee_domain_fields',
    up: (db) => {
      const employeeColumns = columnNames(db, 'employees');
      const addEmployeeColumn = (definition) => {
        const name = definition.split(' ')[0];
        if (!employeeColumns.includes(name)) {
          db.exec(`ALTER TABLE employees ADD COLUMN ${definition}`);
          employeeColumns.push(name);
        }
      };

      addEmployeeColumn('company TEXT');
      addEmployeeColumn('location TEXT');
      addEmployeeColumn('manager_id INTEGER REFERENCES employees(id) ON DELETE SET NULL');
      addEmployeeColumn('employee_code TEXT');
      addEmployeeColumn('pan TEXT');
      addEmployeeColumn('uan TEXT');

      const profileColumns = columnNames(db, 'employee_profiles');
      const addProfileColumn = (definition) => {
        const name = definition.split(' ')[0];
        if (!profileColumns.includes(name)) {
          db.exec(`ALTER TABLE employee_profiles ADD COLUMN ${definition}`);
          profileColumns.push(name);
        }
      };

      addProfileColumn('personal_email TEXT');
      addProfileColumn('gender TEXT');
      addProfileColumn('nationality TEXT');
      addProfileColumn('marital_status TEXT');
      addProfileColumn('love_about_job TEXT');

      rebuildWithCreatedAt(db, 'skills', ['employee_id', 'name'], () => `
        CREATE TABLE skills_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (employee_id, name)
        )`);
      rebuildWithCreatedAt(db, 'certifications', ['employee_id', 'name', 'issuer', 'issued_on', 'expires_on'], () => `
        CREATE TABLE certifications_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          issuer TEXT,
          issued_on TEXT,
          expires_on TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
        CREATE INDEX IF NOT EXISTS idx_employees_last_name ON employees(last_name);
        CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
        CREATE INDEX IF NOT EXISTS idx_employees_position ON employees(position COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees(manager_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employee_code
          ON employees(employee_code COLLATE NOCASE) WHERE employee_code IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_pan
          ON employees(pan COLLATE NOCASE) WHERE pan IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_uan
          ON employees(uan) WHERE uan IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        CREATE INDEX IF NOT EXISTS idx_skills_employee ON skills(employee_id);
        CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name COLLATE NOCASE);
        CREATE INDEX IF NOT EXISTS idx_certifications_employee ON certifications(employee_id);
      `);
    },
  },
  {
    name: '002_add_attendance_and_time_off',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS attendance_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          date TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PRESENT' CHECK (status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE')),
          check_in_time TEXT,
          check_out_time TEXT,
          work_hours REAL DEFAULT 0,
          extra_hours REAL DEFAULT 0,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (employee_id, date)
        );

        CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, date);
        CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date);

        CREATE TABLE IF NOT EXISTS time_off_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK (type IN ('PAID', 'SICK', 'UNPAID')),
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          days INTEGER NOT NULL,
          reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
          reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reviewed_at TEXT,
          rejection_reason TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_time_off_employee ON time_off_requests(employee_id);
        CREATE INDEX IF NOT EXISTS idx_time_off_status ON time_off_requests(status);
    name: '002_add_users_token_version',
    up: (db) => {
      const userColumns = columnNames(db, 'users');
      if (!userColumns.includes('token_version')) {
        db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
  {
    name: '003_add_directory_indexes',
    // Directory endpoint indexes.
    //
    // - idx_employees_directory_order matches the directory listing's default
    //   ORDER BY (last_name/first_name, NOCASE) so pagination via LIMIT/OFFSET
    //   walks a pre-sorted index instead of building a temp b-tree per page.
    //
    // Other search/filter fields are already covered:
    //   department, status, position -> migration 001
    //   skills(name) + skills(employee_id) -> migration 001
    //   users.employee_id (account-status derivation join) -> UNIQUE constraint
    //
    // Deliberately NOT indexed: employees.email and users.login_id. They were
    // removed from directory search because they are sensitive/non-directory
    // fields; an index would only encourage reintroducing them.
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_employees_directory_order
          ON employees(last_name COLLATE NOCASE, first_name COLLATE NOCASE);
      `);
    },
  },
];

function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function hasCreatedAt(db, table) {
  return columnNames(db, table).includes('created_at');
}

function rebuildWithCreatedAt(db, table, dataColumns, buildDdl) {
  if (hasCreatedAt(db, table)) return;

  db.exec(buildDdl());
  db.exec(
    `INSERT INTO ${table}_new (id, ${dataColumns.join(', ')})
     SELECT id, ${dataColumns.join(', ')} FROM ${table}`
  );
  db.exec(`DROP TABLE ${table}`);
  db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
}

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name)
  );
  const newlyApplied = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name);
    })();
    newlyApplied.push(migration.name);
  }

  return newlyApplied;
}
