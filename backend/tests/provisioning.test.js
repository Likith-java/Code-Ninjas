import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { bootstrap, cleanup } from './helpers.js';

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
