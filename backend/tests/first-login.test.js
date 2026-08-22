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
