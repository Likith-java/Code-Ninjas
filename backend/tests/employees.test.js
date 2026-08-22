import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, cleanup, login } from './helpers.js';

let request;
let dbPath;
let admin;
let hr;
let employee;

before(async () => {
  ({ request, dbPath } = await bootstrap());
  admin = await login(request, 'admin@dayflow.com', 'Admin@123');
  hr = await login(request, 'hr@dayflow.com', 'Hr@123456');
  employee = await login(request, 'employee@dayflow.com', 'Employee@123');
});

after(() => cleanup(dbPath));

test('employee list requires authentication', async () => {
  const res = await request.get('/api/employees');
  assert.equal(res.status, 401);
});

test('any authenticated user can list employees', async () => {
  const res2 = await request.get('/api/employees').set('Cookie', employee.cookie);
  assert.equal(res2.status, 200);
  assert.ok(Array.isArray(res2.body.data));
  assert.ok(res2.body.meta.total >= 6);
  assert.equal(res2.body.data[0].full_name.includes(' '), true);
});

test('search query filters by name and position', async () => {
  const res = await request.get('/api/employees?q=developer').set('Cookie', hr.cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2);
});

test('department filter narrows results', async () => {
  const res = await request
    .get('/api/employees?department=Engineering')
    .set('Cookie', hr.cookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.data.length >= 2);
  for (const row of res.body.data) {
    assert.equal(row.department, 'Engineering');
  }
});

test('pagination meta is returned', async () => {
  const res = await request.get('/api/employees?page=1&limit=3').set('Cookie', hr.cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 3);
  assert.equal(res.body.meta.limit, 3);
  assert.ok(res.body.meta.totalPages >= 2);
});

const validEmployee = {
  first_name: 'Test',
  last_name: 'Person',
  email: 'test.person@dayflow.io',
  position: 'QA Engineer',
  department: 'Engineering',
};

test('regular employees cannot create records (RBAC)', async () => {
  const res = await request
    .post('/api/employees')
    .set('Cookie', employee.cookie)
    .send(validEmployee);
  assert.equal(res.status, 403);
});

test('create fails validation with missing fields', async () => {
  const res = await request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send({ first_name: 'Only' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.message, 'Validation failed');
  const fields = res.body.error.details.map((d) => d.field);
  assert.ok(fields.includes('last_name'));
  assert.ok(fields.includes('email'));
  assert.ok(fields.includes('position'));
});

test('create fails on invalid department', async () => {
  const res = await request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send({ ...validEmployee, email: 'bad.dept@dayflow.io', department: 'Sales' });
  assert.equal(res.status, 400);
});

let createdId;

test('hr can create an employee', async () => {
  const res = await request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send(validEmployee);
  assert.equal(res.status, 201);
  createdId = res.body.data.id;
  assert.equal(res.body.data.full_name, 'Test Person');
  assert.equal(res.body.data.status, 'active');
});

test('duplicate email is rejected', async () => {
  const res = await request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send(validEmployee);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details[0].field, 'email');
});

test('single employee can be fetched', async () => {
  const res = await request.get(`/api/employees/${createdId}`).set('Cookie', hr.cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.email, 'test.person@dayflow.io');
});

test('unknown employee returns 404', async () => {
  const res = await request.get('/api/employees/99999').set('Cookie', hr.cookie);
  assert.equal(res.status, 404);
});

test('admin can update an employee', async () => {
  const res = await request
    .put(`/api/employees/${createdId}`)
    .set('Cookie', admin.cookie)
    .send({ position: 'Senior QA Engineer', status: 'on_leave' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.position, 'Senior QA Engineer');
  assert.equal(res.body.data.status, 'on_leave');
});

test('update validates merged payload', async () => {
  const res = await request
    .put(`/api/employees/${createdId}`)
    .set('Cookie', admin.cookie)
    .send({ email: 'not-an-email' });
  assert.equal(res.status, 400);
});

test('admin can delete an employee', async () => {
  const res = await request.delete(`/api/employees/${createdId}`).set('Cookie', admin.cookie);
  assert.equal(res.status, 200);
  const gone = await request.get(`/api/employees/${createdId}`).set('Cookie', admin.cookie);
  assert.equal(gone.status, 404);
});
