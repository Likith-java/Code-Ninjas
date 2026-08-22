import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, cleanup, login } from './helpers.js';

let request;
let dbPath;
let admin;
let employee;
let michaelId;

const validPdfBase64 = Buffer.from('%PDF-1.4\n%fake-for-tests\n').toString('base64');

before(async () => {
  ({ request, dbPath } = await bootstrap());
  admin = await login(request, 'admin@dayflow.com', 'Admin@123');
  employee = await login(request, 'employee@dayflow.com', 'Employee@123');
  michaelId = employee.user.employee_id;
});

after(() => cleanup(dbPath));

test('employees can replace their own skill set', async () => {
  const res = await request
    .put(`/api/employees/${michaelId}/skills`)
    .set('Cookie', employee.cookie)
    .send({ skills: ['React', 'TypeScript', 'Vite'] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.skills, ['React', 'TypeScript', 'Vite']);

  const detail = await request.get(`/api/employees/${michaelId}`).set('Cookie', employee.cookie);
  assert.deepEqual(detail.body.data.skills, ['React', 'TypeScript', 'Vite']);
});

test('skills validation rejects bad payloads', async () => {
  const notArray = await request
    .put(`/api/employees/${michaelId}/skills`)
    .set('Cookie', employee.cookie)
    .send({ skills: 'React' });
  assert.equal(notArray.status, 400);

  const duplicate = await request
    .put(`/api/employees/${michaelId}/skills`)
    .set('Cookie', employee.cookie)
    .send({ skills: ['React', 'react'] });
  assert.equal(duplicate.status, 400);
});

test('only the owner or a manager can edit skills', async () => {
  const sarah = await request.get('/api/employees?q=connor').set('Cookie', admin.cookie);
  const sarahId = sarah.body.data[0].id;
  const asOtherEmployee = await request
    .put(`/api/employees/${sarahId}/skills`)
    .set('Cookie', employee.cookie)
    .send({ skills: ['H4x'] });
  assert.equal(asOtherEmployee.status, 403);

  const asManager = await request
    .put(`/api/employees/${sarahId}/skills`)
    .set('Cookie', admin.cookie)
    .send({ skills: ['Recruiting'] });
  assert.equal(asManager.status, 200);
});

test('certifications replace-set validates entries and dates', async () => {
  const ok = await request
    .put(`/api/employees/${michaelId}/certifications`)
    .set('Cookie', employee.cookie)
    .send({
      certifications: [
        { name: 'AWS Solutions Architect', issuer: 'Amazon', issued_on: '2023-01-15', expires_on: null },
      ],
    });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.certifications.length, 1);

  const missingName = await request
    .put(`/api/employees/${michaelId}/certifications`)
    .set('Cookie', employee.cookie)
    .send({ certifications: [{ issuer: 'Ghost' }] });
  assert.equal(missingName.status, 400);
  assert.ok(
    missingName.body.error.details.some((d) => d.field === 'certifications[0].name')
  );

  const badDate = await request
    .put(`/api/employees/${michaelId}/certifications`)
    .set('Cookie', employee.cookie)
    .send({ certifications: [{ name: 'X', issued_on: 'not-a-date' }] });
  assert.equal(badDate.status, 400);
});

test('resume text is stored and returned only to self/managers', async () => {
  const res = await request
    .put(`/api/employees/${michaelId}/resume`)
    .set('Cookie', employee.cookie)
    .send({ resume_text: '# Michael Doe\nFrontend engineer.' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.resume.text.includes('Frontend engineer'), true);

  const otherView = await request.get('/api/employees?q=connor').set('Cookie', employee.cookie);
  const sarahId = otherView.body.data[0].id;
  await request.put(`/api/employees/${sarahId}/resume`).set('Cookie', admin.cookie).send({ resume_text: 'secret' });
  const peek = await request.get(`/api/employees/${sarahId}`).set('Cookie', employee.cookie);
  assert.ok(!JSON.stringify(peek.body).includes('secret'));
});

test('resume PDF upload, download, and clearing work end-to-end', async () => {
  const upload = await request
    .put(`/api/employees/${michaelId}/resume`)
    .set('Cookie', employee.cookie)
    .send({ resume_pdf_base64: validPdfBase64, resume_pdf_name: 'michael.pdf' });
  assert.equal(upload.status, 200);
  assert.equal(upload.body.data.resume.has_pdf, true);
  assert.ok(upload.body.data.resume.pdf_size > 0);

  const download = await request
    .get(`/api/employees/${michaelId}/resume.pdf`)
    .set('Cookie', employee.cookie);
  assert.equal(download.status, 200);
  assert.equal(download.headers['content-type'], 'application/pdf');
  assert.equal(download.body.toString('latin1').startsWith('%PDF-'), true);

  const managerDownload = await request
    .get(`/api/employees/${michaelId}/resume.pdf`)
    .set('Cookie', admin.cookie);
  assert.equal(managerDownload.status, 200);

  const cleared = await request
    .put(`/api/employees/${michaelId}/resume`)
    .set('Cookie', employee.cookie)
    .send({ resume_pdf_base64: null });
  assert.equal(cleared.body.data.resume.has_pdf, false);

  const gone = await request
    .get(`/api/employees/${michaelId}/resume.pdf`)
    .set('Cookie', employee.cookie);
  assert.equal(gone.status, 404);
});

test('non-PDF payloads are rejected by magic-byte inspection', async () => {
  const fake = Buffer.from('just text pretending to be pdf').toString('base64');
  const res = await request
    .put(`/api/employees/${michaelId}/resume`)
    .set('Cookie', employee.cookie)
    .send({ resume_pdf_base64: fake });
  assert.equal(res.status, 400);
});

test('oversized PDFs are rejected', async () => {
  const buffer = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024, 'a')]);
  const res = await request
    .put(`/api/employees/${michaelId}/resume`)
    .set('Cookie', employee.cookie)
    .send({ resume_pdf_base64: buffer.toString('base64') });
  assert.equal(res.status, 400);
});
