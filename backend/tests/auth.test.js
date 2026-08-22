import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, cleanup, login } from './helpers.js';

let request;
let dbPath;

before(async () => {
  ({ request, dbPath } = await bootstrap());
});

after(() => cleanup(dbPath));

test('health endpoint is public', async () => {
  const res = await request.get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'ok');
});

test('login requires email and password', async () => {
  const res = await request.post('/api/auth/login').send({});
  assert.equal(res.status, 400);
});

test('login rejects wrong password', async () => {
  const res = await request
    .post('/api/auth/login')
    .send({ email: 'admin@dayflow.com', password: 'wrong' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.message, 'Invalid email or password');
});

test('admin can log in and receives httpOnly session cookie', async () => {
  const res = await request
    .post('/api/auth/login')
    .send({ email: 'admin@dayflow.com', password: 'Admin@123' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.role, 'admin');
  const cookie = res.headers['set-cookie'][0];
  assert.match(cookie, /token=/);
  assert.match(cookie, /HttpOnly/i);
});

test('me requires authentication', async () => {
  const res = await request.get('/api/auth/me');
  assert.equal(res.status, 401);
});

test('me returns the current user with a valid cookie', async () => {
  const { cookie, user } = await login(request, 'hr@dayflow.com', 'Hr@123456');
  assert.equal(user.role, 'hr');
  const res = await request.get('/api/auth/me').set('Cookie', cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.email, 'hr@dayflow.com');
  assert.equal(res.body.data.role, 'hr');
});

test('me works with a Bearer token as well', async () => {
  const res = await request
    .post('/api/auth/login')
    .send({ email: 'employee@dayflow.com', password: 'Employee@123' });
  const cookieHeader = res.headers['set-cookie'][0];
  const token = /token=([^;]+)/.exec(cookieHeader)[1];
  const me = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.data.email, 'employee@dayflow.com');
});

test('logout clears the session cookie', async () => {
  const { cookie } = await login(request, 'admin@dayflow.com', 'Admin@123');
  const res = await request.post('/api/auth/logout').set('Cookie', cookie);
  assert.equal(res.status, 200);
  const setCookie = res.headers['set-cookie'][0];
  assert.match(setCookie, /token=;/);
  assert.match(setCookie, /Expires=Thu, 01 Jan 1970/i);
});
