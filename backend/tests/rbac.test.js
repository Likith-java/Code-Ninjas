import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, cleanup, login } from './helpers.js';

let request;
let dbPath;
let admin;
let hr;
let employee;
let michaelId;
let sarahId;

before(async () => {
  ({ request, dbPath } = await bootstrap());
  admin = await login(request, 'admin@dayflow.com', 'Admin@123');
  hr = await login(request, 'hr@dayflow.com', 'Hr@123456');
  employee = await login(request, 'employee@dayflow.com', 'Employee@123');
  michaelId = employee.user.employee_id;
  const sarah = await request.get('/api/employees?q=connor').set('Cookie', hr.cookie);
  sarahId = sarah.body.data[0].id;
});

after(() => cleanup(dbPath));

test('employees cannot create employees', async () => {
  const res = await request
    .post('/api/employees')
    .set('Cookie', employee.cookie)
    .send({ first_name: 'Nope' });
  assert.equal(res.status, 403);
});

test('employees cannot delete or manage account state', async () => {
  for (const call of [
    () => request.delete(`/api/employees/${michaelId}`).set('Cookie', employee.cookie),
    () =>
      request
        .patch(`/api/employees/${sarahId}/status`)
        .set('Cookie', employee.cookie)
        .send({ account_status: 'disabled' }),
    () => request.post(`/api/employees/${michaelId}/reset-password`).set('Cookie', employee.cookie),
    () => request.get(`/api/employees/${sarahId}/security`).set('Cookie', employee.cookie),
  ]) {
    const res = await call();
    assert.equal(res.status, 403);
  }
});

test('other profiles are read-only and exclude private data', async () => {
  const res = await request.get(`/api/employees/${sarahId}`).set('Cookie', employee.cookie);
  assert.equal(res.status, 200);
  const body = res.body.data;
  assert.equal(body.viewer, 'other');
  assert.equal(body.can_edit, false);
  for (const forbidden of ['email', 'phone', 'date_of_birth', 'address', 'resume']) {
    assert.ok(!(forbidden in body), `${forbidden} must not be exposed to other employees`);
  }
  assert.ok(Array.isArray(body.skills));
  assert.ok(Array.isArray(body.certifications));
});

test('own and manager views include private fields with edit permission', async () => {
  const own = await request.get(`/api/employees/${michaelId}`).set('Cookie', employee.cookie);
  assert.equal(own.body.data.viewer, 'self');
  assert.equal(own.body.data.can_edit, true);
  assert.equal(own.body.data.email, 'michael.doe@dayflow.io');
  assert.ok('resume' in own.body.data);

  const managed = await request.get(`/api/employees/${michaelId}`).set('Cookie', hr.cookie);
  assert.equal(managed.body.data.viewer, 'manager');
  assert.equal(managed.body.data.can_edit, true);
});

test('employees can edit only their own whitelisted fields', async () => {
  const allowed = await request
    .put(`/api/employees/${michaelId}`)
    .set('Cookie', employee.cookie)
    .send({ about: 'Updated by self', phone: '+91 90000 11111', address: 'MG Road, Bengaluru' });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.data.about, 'Updated by self');
  assert.equal(allowed.body.data.phone, '+91 90000 11111');

  const coreField = await request
    .put(`/api/employees/${michaelId}`)
    .set('Cookie', employee.cookie)
    .send({ department: 'Marketing' });
  assert.equal(coreField.status, 400);

  const unknownField = await request
    .put(`/api/employees/${michaelId}`)
    .set('Cookie', employee.cookie)
    .send({ resume_text: 'nope' });
  assert.equal(unknownField.status, 400);
});

test('employees cannot edit other employees at all', async () => {
  const res = await request
    .put(`/api/employees/${sarahId}`)
    .set('Cookie', employee.cookie)
    .send({ about: 'hacked' });
  assert.equal(res.status, 403);
});

test('resume downloads are restricted to the owner and managers', async () => {
  const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
  await request
    .put(`/api/employees/${sarahId}/resume`)
    .set('Cookie', hr.cookie)
    .send({ resume_pdf_base64: pdf, resume_pdf_name: 'sarah.pdf' });

  const asOther = await request
    .get(`/api/employees/${sarahId}/resume.pdf`)
    .set('Cookie', employee.cookie);
  assert.equal(asOther.status, 403);

  const asManager = await request
    .get(`/api/employees/${sarahId}/resume.pdf`)
    .set('Cookie', hr.cookie);
  assert.equal(asManager.status, 200);
});

test('disabling an account blocks login and kills existing sessions', async () => {
  const provisioned = await request
    .post('/api/employees')
    .set('Cookie', admin.cookie)
    .send({
      first_name: 'Disable',
      last_name: 'Me',
      email: 'disable.me@dayflow.io',
      position: 'QA',
      department: 'Engineering',
    });
  const { login_id, temp_password } = provisioned.body.data.account;
  const targetId = provisioned.body.data.id;
  const session = await request.post('/api/auth/login').send({ identifier: login_id, password: temp_password });
  const cookie = session.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

  await request
    .patch(`/api/employees/${targetId}/status`)
    .set('Cookie', admin.cookie)
    .send({ account_status: 'disabled' });

  const blockedSession = await request.get('/api/auth/me').set('Cookie', cookie);
  assert.equal(blockedSession.status, 401);

  const blockedLogin = await request
    .post('/api/auth/login')
    .send({ identifier: login_id, password: temp_password });
  assert.equal(blockedLogin.status, 401);
  assert.equal(blockedLogin.body.error.message, 'Invalid credentials');

  await request
    .patch(`/api/employees/${targetId}/status`)
    .set('Cookie', admin.cookie)
    .send({ account_status: 'active' });
  const restored = await request
    .post('/api/auth/login')
    .send({ identifier: login_id, password: temp_password });
  assert.equal(restored.status, 200);
});

test('the security endpoint never exposes password material', async () => {
  const res = await request.get(`/api/employees/${michaelId}/security`).set('Cookie', admin.cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.login_id, 'MIDO20220001');
  assert.ok(!JSON.stringify(res.body).toLowerCase().includes('password_hash'));
});
