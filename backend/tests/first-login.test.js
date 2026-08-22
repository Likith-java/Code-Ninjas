import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, cleanup, login } from './helpers.js';

let request;
let dbPath;
let hr;
let provisioned;

before(async () => {
  ({ request, dbPath } = await bootstrap());
  hr = await login(request, 'hr@dayflow.com', 'Hr@123456');
  const res = await request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send({
      first_name: 'Tina',
      last_name: 'Temporary',
      email: 'tina.temporary@dayflow.io',
      position: 'Intern',
      department: 'Engineering',
    });
  provisioned = res.body.data;
});

after(() => cleanup(dbPath));

test('provisioned accounts receive a formatted login ID', () => {
  assert.match(provisioned.account.login_id, /^[A-Z]{4}\d{8}$/);
  assert.ok(provisioned.account.login_id.startsWith('TITE'));
});

test('new users can log in with their login ID and are flagged for a password change', async () => {
  const res = await request.post('/api/auth/login').send({
    identifier: provisioned.account.login_id,
    password: provisioned.account.temp_password,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.must_change_password, true);
});

test('business endpoints are blocked until the password is changed', async () => {
  const session = await request.post('/api/auth/login').send({
    identifier: provisioned.account.login_id,
    password: provisioned.account.temp_password,
  });
  const cookie = session.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

  const res = await request.get('/api/employees').set('Cookie', cookie);
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'PASSWORD_CHANGE_REQUIRED');

  const me = await request.get('/api/auth/me').set('Cookie', cookie);
  assert.equal(me.status, 200);
});

test('change-password rejects a wrong temporary password', async () => {
  const session = await request.post('/api/auth/login').send({
    identifier: provisioned.account.login_id,
    password: provisioned.account.temp_password,
  });
  const cookie = session.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  const res = await request
    .post('/api/auth/change-password')
    .set('Cookie', cookie)
    .send({ current_password: 'NotTheTemp123', new_password: 'NewPass1234' });
  assert.equal(res.status, 400);
});

test('change-password enforces the password policy', async () => {
  const session = await request.post('/api/auth/login').send({
    identifier: provisioned.account.login_id,
    password: provisioned.account.temp_password,
  });
  const cookie = session.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

  const weak = await request
    .post('/api/auth/change-password')
    .set('Cookie', cookie)
    .send({ current_password: provisioned.account.temp_password, new_password: 'weak' });
  assert.equal(weak.status, 400);
  assert.ok(weak.body.error.details.length >= 1);

  const same = await request
    .post('/api/auth/change-password')
    .set('Cookie', cookie)
    .send({
      current_password: provisioned.account.temp_password,
      new_password: provisioned.account.temp_password,
    });
  assert.equal(same.status, 400);
});

test('a successful change clears the flag and revokes the temporary password', async () => {
  const session = await request.post('/api/auth/login').send({
    identifier: provisioned.account.login_id,
    password: provisioned.account.temp_password,
  });
  const cookie = session.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

  const changed = await request
    .post('/api/auth/change-password')
    .set('Cookie', cookie)
    .send({ current_password: provisioned.account.temp_password, new_password: 'Sturdy#2026' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.must_change_password, false);

  const oldTemp = await request.post('/api/auth/login').send({
    identifier: provisioned.account.login_id,
    password: provisioned.account.temp_password,
  });
  assert.equal(oldTemp.status, 401);
  assert.equal(oldTemp.body.error.code, 'INVALID_CREDENTIALS');

  const fresh = await login(request, provisioned.account.login_id, 'Sturdy#2026');
  assert.equal(fresh.user.must_change_password, false);

  const list = await request.get('/api/employees').set('Cookie', fresh.cookie);
  assert.equal(list.status, 200);
});

test('sessions issued before a password change are revoked', async () => {
  const created = await request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send({
      first_name: 'Rita',
      last_name: 'Revoked',
      email: 'rita.revoked@dayflow.io',
      position: 'QA Engineer',
      department: 'Engineering',
    });
  const { login_id, temp_password } = created.body.data.account;

  const before = await request
    .post('/api/auth/login')
    .send({ identifier: login_id, password: temp_password });
  assert.equal(before.status, 200);
  const staleCookie = before.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  const staleToken = /token=([^;]+)/.exec(before.headers['set-cookie'][0])[1];

  const changed = await request
    .post('/api/auth/change-password')
    .set('Cookie', staleCookie)
    .send({ current_password: temp_password, new_password: 'FreshStart1' });
  assert.equal(changed.status, 200);
  assert.ok(changed.headers['set-cookie'].some((c) => c.startsWith('token=')));

  const oldCookieMe = await request.get('/api/auth/me').set('Cookie', staleCookie);
  assert.equal(oldCookieMe.status, 401);

  const oldBearerMe = await request
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${staleToken}`);
  assert.equal(oldBearerMe.status, 401);

  const oldCookieList = await request.get('/api/employees').set('Cookie', staleCookie);
  assert.equal(oldCookieList.status, 401);

  const newCookie = changed.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  const newSession = await request.get('/api/auth/me').set('Cookie', newCookie);
  assert.equal(newSession.status, 200);
  assert.equal(newSession.body.data.must_change_password, false);

  const normalLogin = await login(request, login_id, 'FreshStart1');
  assert.equal(normalLogin.user.must_change_password, false);
});

test('an admin password reset revokes existing sessions', async () => {
  const employeeLogin = await request
    .post('/api/auth/login')
    .send({ email: 'employee@dayflow.com', password: 'Employee@123' });
  const employeeCookie = employeeLogin.headers['set-cookie']
    .map((c) => c.split(';')[0])
    .join('; ');
  assert.equal(employeeLogin.status, 200);

  const found = await request.get('/api/employees?q=michael').set('Cookie', hr.cookie);
  const michaelId = found.body.data[0].id;
  const reset = await request
    .post(`/api/employees/${michaelId}/reset-password`)
    .set('Cookie', hr.cookie);
  assert.equal(reset.status, 200);
  const tempPassword = reset.body.data.temp_password;

  const revoked = await request.get('/api/auth/me').set('Cookie', employeeCookie);
  assert.equal(revoked.status, 401);

  const relogin = await request
    .post('/api/auth/login')
    .send({ email: 'employee@dayflow.com', password: tempPassword });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.data.must_change_password, true);
});
