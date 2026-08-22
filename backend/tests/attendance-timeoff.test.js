import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from '../src/config/db.js';
import { seed } from '../src/seed.js';

test.beforeEach(() => {
  seed();
});

test('attendance summary returns exact payroll metrics format', async () => {
  const app = createApp();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: 'admin@dayflow.com', password: 'Admin@123' })
    .expect(200);

  const cookie = loginRes.headers['set-cookie'];

  const emp = db.prepare('SELECT id FROM employees LIMIT 1').get();
  assert.ok(emp, 'Employee exists');

  const res = await request(app)
    .get(`/api/attendance/summary?employeeId=${emp.id}&startDate=2026-08-01&endDate=2026-08-31`)
    .set('Cookie', cookie)
    .expect(200);

  assert.ok(res.body.metrics || res.body.data?.metrics);
  const metrics = res.body.metrics || res.body.data.metrics;

  assert.equal(typeof metrics.daysPresent, 'number');
  assert.equal(typeof metrics.approvedPaidLeaves, 'number');
  assert.equal(typeof metrics.approvedUnpaidLeaves, 'number');
  assert.equal(typeof metrics.missingCheckOuts, 'number');
});

test('check-in and check-out work end-to-end', async () => {
  const app = createApp();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: 'employee@dayflow.com', password: 'Employee@123' })
    .expect(200);

  const cookie = loginRes.headers['set-cookie'];
  const testDate = '2026-08-15';

  // Check in
  const checkInRes = await request(app)
    .post('/api/attendance/check-in')
    .set('Cookie', cookie)
    .send({ date: testDate, time: '2026-08-15T09:00:00Z' })
    .expect(200);

  assert.equal(checkInRes.body.data.status, 'PRESENT');
  assert.equal(checkInRes.body.data.check_in_time, '2026-08-15T09:00:00Z');
  assert.equal(checkInRes.body.data.check_out_time, null);

  // Check out
  const checkOutRes = await request(app)
    .post('/api/attendance/check-out')
    .set('Cookie', cookie)
    .send({ date: testDate, time: '2026-08-15T18:00:00Z' })
    .expect(200);

  assert.equal(checkOutRes.body.data.check_out_time, '2026-08-15T18:00:00Z');
  assert.equal(checkOutRes.body.data.work_hours, 9);
  assert.equal(checkOutRes.body.data.extra_hours, 1);
});

test('time-off submission, listing, and approval flow work end-to-end', async () => {
  const app = createApp();

  // Employee login & submit
  const empLogin = await request(app)
    .post('/api/auth/login')
    .send({ identifier: 'employee@dayflow.com', password: 'Employee@123' })
    .expect(200);

  const empCookie = empLogin.headers['set-cookie'];

  const submitRes = await request(app)
    .post('/api/time-off')
    .set('Cookie', empCookie)
    .send({
      type: 'UNPAID',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      days: 2,
      reason: 'Urgent family task',
    })
    .expect(201);

  const createdId = submitRes.body.data.id;
  assert.equal(submitRes.body.data.status, 'PENDING');
  assert.equal(submitRes.body.data.type, 'UNPAID');

  // Employee cannot approve
  await request(app)
    .patch(`/api/time-off/${createdId}/status`)
    .set('Cookie', empCookie)
    .send({ status: 'APPROVED' })
    .expect(403);

  // HR login & approve
  const hrLogin = await request(app)
    .post('/api/auth/login')
    .send({ identifier: 'hr@dayflow.com', password: 'Hr@123456' })
    .expect(200);

  const hrCookie = hrLogin.headers['set-cookie'];

  const approveRes = await request(app)
    .patch(`/api/time-off/${createdId}/status`)
    .set('Cookie', hrCookie)
    .send({ status: 'APPROVED' })
    .expect(200);

  assert.equal(approveRes.body.data.status, 'APPROVED');
});
