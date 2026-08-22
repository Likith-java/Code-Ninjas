import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { bootstrap, cleanup, login } from './helpers.js';
import { db } from '../src/config/db.js';

const DEV_SECRET = 'dayflow-dev-secret-change-me';

let request;
let dbPath;
let admin;
let hr;
let employee;
let michaelId;
let sarahId;
let employeeUserId;

function forgeToken(payload) {
  return jwt.sign(payload, DEV_SECRET, { expiresIn: '7d' });
}

function userRow(userId) {
  return db
    .prepare('SELECT id, role, token_version FROM users WHERE id = ?')
    .get(userId);
}

before(async () => {
  ({ request, dbPath } = await bootstrap());
  admin = await login(request, 'admin@dayflow.com', 'Admin@123');
  hr = await login(request, 'hr@dayflow.com', 'Hr@123456');
  employee = await login(request, 'employee@dayflow.com', 'Employee@123');
  michaelId = employee.user.employee_id;
  employeeUserId = employee.user.id;
  const sarah = await request.get('/api/employees?q=connor').set('Cookie', admin.cookie);
  sarahId = sarah.body.data[0].id;
});

after(() => cleanup(dbPath));

// ---------------------------------------------------------------------------
// 1. Anonymous requests
// ---------------------------------------------------------------------------

test('anonymous requests are rejected on every protected endpoint', async () => {
  const calls = [
    () => request.get('/api/employees'),
    () => request.get('/api/employees/meta'),
    () => request.get(`/api/employees/${michaelId}`),
    () => request.post('/api/employees').send({ first_name: 'X' }),
    () => request.put(`/api/employees/${michaelId}`).send({ about: 'x' }),
    () => request.delete(`/api/employees/${michaelId}`),
    () => request.get(`/api/employees/${michaelId}/security`),
    () => request.patch(`/api/employees/${michaelId}/status`).send({ account_status: 'disabled' }),
  ];
  for (const call of calls) {
    const res = await call();
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  }
});

test('invalid or tampered credentials are rejected without detail leaks', async () => {
  const garbage = await request
    .get('/api/employees')
    .set('Cookie', 'token=not-a-jwt');
  assert.equal(garbage.status, 401);

  const valid = jwt.sign(
    { sub: employeeUserId, role: 'employee', ver: userRow(employeeUserId).token_version },
    DEV_SECRET,
    { expiresIn: '7d' }
  );
  const tampered = await request.get('/api/employees').set('Cookie', `token=${valid}x`);
  assert.equal(tampered.status, 401);
});

// ---------------------------------------------------------------------------
// 2. ADMIN allowed
// ---------------------------------------------------------------------------

test('admin can manage the full employee lifecycle', async () => {
  const list = await request.get('/api/employees').set('Cookie', admin.cookie);
  assert.equal(list.status, 200);

  const search = await request.get('/api/employees?q=doe').set('Cookie', admin.cookie);
  assert.equal(search.status, 200);
  assert.ok(search.body.data.length >= 1);

  const meta = await request.get('/api/employees/meta').set('Cookie', admin.cookie);
  assert.equal(meta.status, 200);

  const created = await request
    .post('/api/employees')
    .set('Cookie', admin.cookie)
    .send({
      first_name: 'Rbac',
      last_name: 'Target',
      email: 'rbac.target@dayflow.io',
      position: 'QA',
      department: 'Engineering',
    });
  assert.equal(created.status, 201);
  const targetId = created.body.data.id;

  const view = await request.get(`/api/employees/${targetId}`).set('Cookie', admin.cookie);
  assert.equal(view.status, 200);
  assert.equal(view.body.data.viewer, 'manager');

  const edited = await request
    .put(`/api/employees/${targetId}`)
    .set('Cookie', admin.cookie)
    .send({ position: 'Senior QA' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.position, 'Senior QA');

  const security = await request
    .get(`/api/employees/${targetId}/security`)
    .set('Cookie', admin.cookie);
  assert.equal(security.status, 200);
  assert.ok(!JSON.stringify(security.body).toLowerCase().includes('password_hash'));

  const disabled = await request
    .patch(`/api/employees/${targetId}/status`)
    .set('Cookie', admin.cookie)
    .send({ account_status: 'disabled' });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.body.data.account_status, 'disabled');

  const reset = await request
    .post(`/api/employees/${targetId}/reset-password`)
    .set('Cookie', admin.cookie);
  assert.equal(reset.status, 200);
  assert.ok(reset.body.data.temp_password);

  const removed = await request.delete(`/api/employees/${targetId}`).set('Cookie', admin.cookie);
  assert.equal(removed.status, 200);
  const gone = await request.get(`/api/employees/${targetId}`).set('Cookie', admin.cookie);
  assert.equal(gone.status, 404);
});

// ---------------------------------------------------------------------------
// 3. EMPLOYEE allowed (product rules)
// ---------------------------------------------------------------------------

test('employee can browse the directory and search', async () => {
  const list = await request.get('/api/employees').set('Cookie', employee.cookie);
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.data));

  const search = await request
    .get('/api/employees?q=developer')
    .set('Cookie', employee.cookie);
  assert.equal(search.status, 200);
});

test('employee sees own profile with private fields and edit access', async () => {
  const res = await request.get(`/api/employees/${michaelId}`).set('Cookie', employee.cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.viewer, 'self');
  assert.equal(res.body.data.can_edit, true);
  assert.ok('date_of_birth' in res.body.data);
});

test('employee sees other profiles read-only without private data', async () => {
  const res = await request.get(`/api/employees/${sarahId}`).set('Cookie', employee.cookie);
  assert.equal(res.status, 200);
  const body = res.body.data;
  assert.equal(body.viewer, 'other');
  assert.equal(body.can_edit, false);
  for (const forbidden of ['email', 'phone', 'date_of_birth', 'address', 'resume']) {
    assert.ok(!(forbidden in body), `${forbidden} must not be exposed`);
  }
});

test('employee can update only whitelisted fields on own profile', async () => {
  const res = await request
    .put(`/api/employees/${michaelId}`)
    .set('Cookie', employee.cookie)
    .send({
      about: 'Self-service update',
      phone: '+91 90000 22222',
      address: 'Indiranagar, Bengaluru',
      date_of_birth: '1995-04-12',
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.about, 'Self-service update');
  assert.equal(res.body.data.phone, '+91 90000 22222');
});

test('employee can manage own skills, certifications, and resume', async () => {
  const skills = await request
    .put(`/api/employees/${michaelId}/skills`)
    .set('Cookie', employee.cookie)
    .send({ skills: ['React', 'TypeScript'] });
  assert.equal(skills.status, 200);
  assert.deepEqual(skills.body.data.skills, ['React', 'TypeScript']);

  const certs = await request
    .put(`/api/employees/${michaelId}/certifications`)
    .set('Cookie', employee.cookie)
    .send({
      certifications: [{ name: 'AWS CCP', issuer: 'Amazon', issued_on: '2024-01-15' }],
    });
  assert.equal(certs.status, 200);
  assert.equal(certs.body.data.certifications[0].name, 'AWS CCP');

  const resume = await request
    .put(`/api/employees/${michaelId}/resume`)
    .set('Cookie', employee.cookie)
    .send({ resume_text: 'My public resume text' });
  assert.equal(resume.status, 200);
  assert.equal(resume.body.data.resume.text, 'My public resume text');
});

// ---------------------------------------------------------------------------
// 4. EMPLOYEE denied admin-only endpoints
// ---------------------------------------------------------------------------

test('employee is denied every admin-only employee management API', async () => {
  const calls = [
    () => request.post('/api/employees').set('Cookie', employee.cookie).send({ first_name: 'Nope' }),
    () => request.get(`/api/employees/${sarahId}/security`).set('Cookie', employee.cookie),
    () =>
      request
        .patch(`/api/employees/${sarahId}/status`)
        .set('Cookie', employee.cookie)
        .send({ account_status: 'disabled' }),
    () =>
      request.post(`/api/employees/${sarahId}/reset-password`).set('Cookie', employee.cookie),
    () => request.delete(`/api/employees/${sarahId}`).set('Cookie', employee.cookie),
  ];
  for (const call of calls) {
    const res = await call();
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  }
});

// ---------------------------------------------------------------------------
// 5. EMPLOYEE denied editing another employee + private mutations
// ---------------------------------------------------------------------------

test('employee cannot edit another employee or their private content', async () => {
  const before = await request.get(`/api/employees/${sarahId}`).set('Cookie', hr.cookie);
  const originalAbout = before.body.data.about;

  const attempts = [
    () => request.put(`/api/employees/${sarahId}`).set('Cookie', employee.cookie).send({ about: 'hacked' }),
    () =>
      request
        .put(`/api/employees/${sarahId}/skills`)
        .set('Cookie', employee.cookie)
        .send({ skills: ['hacked'] }),
    () =>
      request
        .put(`/api/employees/${sarahId}/certifications`)
        .set('Cookie', employee.cookie)
        .send({ certifications: [{ name: 'hacked' }] }),
    () =>
      request
        .put(`/api/employees/${sarahId}/resume`)
        .set('Cookie', employee.cookie)
        .send({ resume_text: 'hacked' }),
    () => request.get(`/api/employees/${sarahId}/resume.pdf`).set('Cookie', employee.cookie),
  ];
  for (const attempt of attempts) {
    const res = await attempt();
    assert.equal(res.status, 403);
  }

  const after = await request.get(`/api/employees/${sarahId}`).set('Cookie', hr.cookie);
  assert.equal(after.body.data.about, originalAbout);
});

// ---------------------------------------------------------------------------
// 6. Privilege escalation attempts
// ---------------------------------------------------------------------------

test('employee cannot escalate through employment fields on own record', async () => {
  for (const payload of [
    { department: 'Executive' },
    { position: 'CEO' },
    { status: 'disabled' },
    { hired_at: '1970-01-01' },
    { email: 'michael@evil.io' },
  ]) {
    const res = await request
      .put(`/api/employees/${michaelId}`)
      .set('Cookie', employee.cookie)
      .send(payload);
    assert.equal(res.status, 400, `field ${Object.keys(payload)[0]} must be rejected`);
  }

  const verify = await request.get(`/api/employees/${michaelId}`).set('Cookie', admin.cookie);
  assert.equal(verify.body.data.department, 'Engineering');
});

test('employee cannot inject security-sensitive fields anywhere', async () => {
  for (const payload of [
    { role: 'admin' },
    { account_status: 'active' },
    { must_change_password: 0 },
    { token_version: 99 },
    { password_hash: 'owned' },
  ]) {
    const res = await request
      .put(`/api/employees/${michaelId}`)
      .set('Cookie', employee.cookie)
      .send(payload);
    assert.equal(res.status, 400, `${Object.keys(payload)[0]} injection must be rejected`);
  }
});

test('employee cannot touch account state even for their own record', async () => {
  const statusRes = await request
    .patch(`/api/employees/${michaelId}/status`)
    .set('Cookie', employee.cookie)
    .send({ account_status: 'active' });
  assert.equal(statusRes.status, 403);

  const resetRes = await request
    .post(`/api/employees/${michaelId}/reset-password`)
    .set('Cookie', employee.cookie);
  assert.equal(resetRes.status, 403);

  const securityRes = await request
    .get(`/api/employees/${michaelId}/security`)
    .set('Cookie', employee.cookie);
  assert.equal(securityRes.status, 403);
});

// ---------------------------------------------------------------------------
// 7. Forged / missing role claims
// ---------------------------------------------------------------------------

test('a forged admin role claim grants nothing; the database decides', async () => {
  const row = userRow(employeeUserId);
  const forged = forgeToken({
    sub: employeeUserId,
    role: 'admin',
    ver: Number(row.token_version ?? 0),
  });
  const cookie = `token=${forged}`;

  const directory = await request.get('/api/employees').set('Cookie', cookie);
  assert.equal(directory.status, 200);

  const createAttempt = await request
    .post('/api/employees')
    .set('Cookie', cookie)
    .send({ first_name: 'Forged' });
  assert.equal(createAttempt.status, 403);

  const securityAttempt = await request
    .get(`/api/employees/${sarahId}/security`)
    .set('Cookie', cookie);
  assert.equal(securityAttempt.status, 403);

  const editAttempt = await request
    .put(`/api/employees/${sarahId}`)
    .set('Cookie', cookie)
    .send({ about: 'forged' });
  assert.equal(editAttempt.status, 403);
});

test('a missing role claim changes nothing; server-side role resolution governs', async () => {
  const row = userRow(employeeUserId);
  const claimless = forgeToken({ sub: employeeUserId, ver: Number(row.token_version ?? 0) });
  const cookie = `token=${claimless}`;

  const directory = await request.get('/api/employees').set('Cookie', cookie);
  assert.equal(directory.status, 200);

  const denied = await request.delete(`/api/employees/${sarahId}`).set('Cookie', cookie);
  assert.equal(denied.status, 403);
});
