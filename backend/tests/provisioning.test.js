import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { bootstrap, cleanup, login } from './helpers.js';

let request;
let dbPath;
let hr;
const year = new Date().getFullYear();

function provision(overrides = {}) {
  return request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send({
      first_name: 'John',
      last_name: 'Doe',
      email: `john.doe.${Math.random().toString(36).slice(2)}@dayflow.io`,
      position: 'Engineer',
      department: 'Engineering',
      ...overrides,
    });
}

before(async () => {
  ({ request, dbPath } = await bootstrap());
  const res = await request.post('/api/auth/login').send({
    email: 'hr@dayflow.com',
    password: 'Hr@123456',
  });
  hr = {
    user: res.body.data,
    cookie: res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; '),
  };
});

after(() => cleanup(dbPath));

test('the first employee for a name gets serial 0001', async () => {
  const res = await provision({ first_name: 'Zara', last_name: 'Quinn' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.account.login_id, `ZAQU${year}0001`);
});

test('a second identical identifier increments the serial', async () => {
  const res = await provision({ first_name: 'Zara', last_name: 'Quinn' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.account.login_id, `ZAQU${year}0002`);
});

test('hired_at drives the year portion', async () => {
  const res = await provision({
    first_name: 'Zara',
    last_name: 'Quinn',
    hired_at: '2019-07-01',
  });
  assert.equal(res.status, 201);
  assert.match(res.body.data.account.login_id, /^ZAQU2019\d{4}$/);
});

test('the temporary password is bcrypt-hashed and never returned again', async () => {
  const created = await provision({ first_name: 'Hashy', last_name: 'McFly' });
  const { login_id, temp_password } = created.body.data.account;

  const dbFile = new Database(dbPath, { readonly: true });
  const user = dbFile.prepare('SELECT password_hash FROM users WHERE login_id = ?').get(login_id);
  dbFile.close();

  assert.notEqual(user.password_hash, temp_password);
  assert.match(user.password_hash, /^\$2[aby]\$/);

  const list = await request.get('/api/employees').set('Cookie', hr.cookie);
  assert.ok(!JSON.stringify(list.body).includes(temp_password));

  const detail = await request
    .get(`/api/employees/${created.body.data.id}`)
    .set('Cookie', hr.cookie);
  assert.ok(!JSON.stringify(detail.body).includes(temp_password));
  assert.ok(!('account' in detail.body.data));
});

test('failed validation creates neither employee nor account', async () => {
  const beforeCount = await request.get('/api/employees?limit=1').set('Cookie', hr.cookie);
  const totalBefore = beforeCount.body.meta.total;

  const res = await request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send({ first_name: 'Broken' });
  assert.equal(res.status, 400);

  const afterCount = await request.get('/api/employees?limit=1').set('Cookie', hr.cookie);
  assert.equal(afterCount.body.meta.total, totalBefore);
});

test('provisioned accounts can log in by login ID and by email', async () => {
  const created = await provision({ first_name: 'Login', last_name: 'Tester' });
  const { login_id, temp_password } = created.body.data.account;
  const email = created.body.data.email;

  const byId = await request.post('/api/auth/login').send({ identifier: login_id, password: temp_password });
  const byEmail = await request.post('/api/auth/login').send({ identifier: email, password: temp_password });

  assert.equal(byId.status, 200);
  assert.equal(byEmail.status, 200);
  assert.equal(byId.body.data.id, byEmail.body.data.id);
});

// ---------------------------------------------------------------------------
// Access control on the provisioning endpoint
// ---------------------------------------------------------------------------

test('unauthenticated callers cannot provision employees', async () => {
  const res = await request.post('/api/employees').send({
    first_name: 'Sneaky',
    last_name: 'Anonymous',
    email: 'sneaky.anonymous@dayflow.io',
    position: 'Engineer',
    department: 'Engineering',
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHENTICATED');
});

test('non-admin roles cannot provision employees', async () => {
  const employee = await login(request, 'employee@dayflow.com', 'Employee@123');
  const res = await request
    .post('/api/employees')
    .set('Cookie', employee.cookie)
    .send({
      first_name: 'Escalated',
      last_name: 'Peer',
      email: 'escalated.peer@dayflow.io',
      position: 'Engineer',
      department: 'Engineering',
    });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

// ---------------------------------------------------------------------------
// Duplicate email handling
// ---------------------------------------------------------------------------

test('duplicate email is rejected without creating partial records', async () => {
  const first = await provision({ first_name: 'Dup', last_name: 'Origin' });
  assert.equal(first.status, 201);
  const duplicateEmail = first.body.data.email;

  const listBefore = await request.get('/api/employees?limit=1').set('Cookie', hr.cookie);
  const totalBefore = listBefore.body.meta.total;

  const second = await provision({
    first_name: 'Dup',
    last_name: 'Clash',
    email: duplicateEmail.toUpperCase(), // uniqueness is case-insensitive
  });
  assert.equal(second.status, 400);
  assert.equal(second.body.error.code, 'VALIDATION_FAILED');
  assert.ok(
    second.body.error.details.some(
      (d) => d.field === 'email' && /already in use/i.test(d.message)
    )
  );

  const listAfter = await request.get('/api/employees?limit=1').set('Cookie', hr.cookie);
  assert.equal(listAfter.body.meta.total, totalBefore);

  // Exactly one account may exist for the email: the original, not a second
  // row slipped in by the rejected attempt.
  const dbFile = new Database(dbPath, { readonly: true });
  const accountCount = dbFile
    .prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?')
    .get(duplicateEmail).count;
  dbFile.close();
  assert.equal(accountCount, 1);
});

// ---------------------------------------------------------------------------
// Transaction rollback on mid-flight constraint failure
// ---------------------------------------------------------------------------

test('a constraint failure after the employee insert rolls everything back', async () => {
  // Simulate a stale/legacy account row that owns the target email while the
  // employees table does not: the employee INSERT succeeds, then the user
  // INSERT hits the UNIQUE constraint on users.email mid-transaction.
  const staleEmail = `stale.account.${Math.random().toString(36).slice(2)}@dayflow.io`;
  const seed = new Database(dbPath);
  seed.prepare(
    `INSERT INTO users (login_id, email, password_hash, role, must_change_password)
     VALUES (?, ?, '$2a$10$notarealhashnotarealhashnotarealhashnotarealhash', 'employee', 0)`
  ).run(`STALE${Date.now()}`.slice(0, 16), staleEmail);
  seed.close();

  const listBefore = await request.get('/api/employees?limit=1').set('Cookie', hr.cookie);
  const totalBefore = listBefore.body.meta.total;

  const res = await provision({ email: staleEmail, first_name: 'Roll', last_name: 'Back' });
  assert.equal(res.status, 400); // handled error, never a 500
  assert.equal(res.body.error.code, 'VALIDATION_FAILED');
  assert.ok(
    res.body.error.details.some((d) => d.field === 'email' && /already in use/i.test(d.message))
  );

  // Full rollback: neither the employee row nor its profile may survive.
  const dbFile = new Database(dbPath, { readonly: true });
  const orphanEmployees = dbFile
    .prepare('SELECT COUNT(*) AS count FROM employees WHERE email = ?')
    .get(staleEmail).count;
  const orphanProfiles = dbFile
    .prepare(
      `SELECT COUNT(*) AS count FROM employee_profiles
       WHERE employee_id NOT IN (SELECT id FROM employees)`
    )
    .get().count;
  dbFile.close();

  assert.equal(orphanEmployees, 0);
  assert.equal(orphanProfiles, 0);

  const listAfter = await request.get('/api/employees?limit=1').set('Cookie', hr.cookie);
  assert.equal(listAfter.body.meta.total, totalBefore);
});

// ---------------------------------------------------------------------------
// Login ID collision handling through the API
// ---------------------------------------------------------------------------

test('same-name collisions are scoped per joining year', async () => {
  const currentYearHire = await provision({ first_name: 'Iris', last_name: 'Nyx' });
  assert.equal(currentYearHire.status, 201);
  assert.equal(currentYearHire.body.data.account.login_id, `IRNY${year}0001`);

  const pastYearHire = await provision({
    first_name: 'IRIS',
    last_name: 'nyx',
    hired_at: '2015-06-15',
  });
  assert.equal(pastYearHire.status, 201);
  assert.equal(pastYearHire.body.data.account.login_id, 'IRNY20150001');
});

// ---------------------------------------------------------------------------
// Safe response shape
// ---------------------------------------------------------------------------

test('the provisioning response exposes credentials but never hash material', async () => {
  const created = await provision({ first_name: 'Safe', last_name: 'Shape' });
  assert.equal(created.status, 201);

  const body = JSON.stringify(created.body);
  assert.ok(!/\$2[aby]\$/.test(body), 'response must not contain bcrypt material');
  assert.ok(!body.includes('password_hash'));
  assert.deepEqual(Object.keys(created.body.data.account).sort(), [
    'login_id',
    'temp_password',
  ]);
});
