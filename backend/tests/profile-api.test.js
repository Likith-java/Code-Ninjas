import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, cleanup, login } from './helpers.js';

let request;
let dbPath;
let admin;
let hr;
let employee;
let michaelId; // linked to employee@dayflow.com ("own" scenarios)
let sarahId; // another employee (linked to the hr account)
let davidId; // a third employee

before(async () => {
  ({ request, dbPath } = await bootstrap());
  admin = await login(request, 'admin@dayflow.com', 'Admin@123');
  hr = await login(request, 'hr@dayflow.com', 'Hr@123456');
  employee = await login(request, 'employee@dayflow.com', 'Employee@123');
  michaelId = employee.user.employee_id;
  const directory = await request.get('/api/employees').set('Cookie', admin.cookie);
  const byName = Object.fromEntries(directory.body.data.map((e) => [e.full_name, e.id]));
  sarahId = byName['Sarah Connor'];
  davidId = byName['David Lee'];
});

after(() => cleanup(dbPath));

// Helpers ---------------------------------------------------------------------

const getProfile = (who, id) =>
  request.get(`/api/employees/${id}/profile`).set('Cookie', who.cookie);
const putProfile = (who, id, body) =>
  request.put(`/api/employees/${id}/profile`).set('Cookie', who.cookie).send(body);
const addSkill = (who, id, body) =>
  request.post(`/api/employees/${id}/skills`).set('Cookie', who.cookie).send(body);
const deleteSkill = (who, id, skillId) =>
  request.delete(`/api/employees/${id}/skills/${skillId}`).set('Cookie', who.cookie);
const addCertification = (who, id, body) =>
  request.post(`/api/employees/${id}/certifications`).set('Cookie', who.cookie).send(body);
const deleteCertification = (who, id, certId) =>
  request.delete(`/api/employees/${id}/certifications/${certId}`).set('Cookie', who.cookie);

function detailFields(res) {
  return res.body.error.details.map((d) => d.field);
}

async function skillListOf(who, id) {
  const res = await getProfile(who, id);
  assert.equal(res.status, 200);
  return res.body.data.skills;
}

async function certificationListOf(who, id) {
  const res = await getProfile(who, id);
  assert.equal(res.status, 200);
  return res.body.data.certifications;
}

// ---------------------------------------------------------------------------
// 1. Authentication
// ---------------------------------------------------------------------------

describe('authentication', () => {
  test('all six profile endpoints reject anonymous callers', async () => {
    const calls = [
      () => request.get(`/api/employees/${michaelId}/profile`),
      () => request.put(`/api/employees/${michaelId}/profile`).send({ about: 'x' }),
      () => request.post(`/api/employees/${michaelId}/skills`).send({ name: 'Go' }),
      () => request.delete(`/api/employees/${michaelId}/skills/1`),
      () => request.post(`/api/employees/${michaelId}/certifications`).send({ name: 'X' }),
      () => request.delete(`/api/employees/${michaelId}/certifications/1`),
    ];
    for (const call of calls) {
      const res = await call();
      assert.equal(res.status, 401);
      assert.equal(res.body.error.code, 'UNAUTHENTICATED');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. GET /profile — per-viewer DTOs
// ---------------------------------------------------------------------------

describe('GET /employees/:id/profile DTO shapes', () => {
  test('own profile exposes the full permitted view without a security block', async () => {
    const res = await getProfile(employee, michaelId);
    assert.equal(res.status, 200);
    const dto = res.body.data;

    assert.equal(dto.viewer, 'self');
    assert.equal(dto.can_edit, true);
    assert.ok(dto.editable_fields.includes('about'));
    assert.ok(dto.editable_fields.includes('date_of_birth'));
    for (const restricted of ['email', 'position', 'pan', 'uan', 'employee_code', 'bank_name']) {
      assert.ok(!dto.editable_fields.includes(restricted));
    }

    // PRD Private Info sections
    assert.equal(dto.private_info.phone, null); // seeded without a phone
    assert.equal(dto.private_info.email, 'michael.doe@dayflow.io');
    assert.equal(dto.private_info.login_id, 'MIDO20220001');
    for (const key of [
      'personal_email',
      'address',
      'date_of_birth',
      'gender',
      'nationality',
      'marital_status',
    ]) {
      assert.ok(key in dto.private_info, `private_info.${key} must exist`);
    }
    assert.deepEqual(Object.keys(dto.private_info.bank_details).sort(), [
      'account_number',
      'bank_name',
      'ifsc_code',
    ]);
    assert.deepEqual(Object.keys(dto.private_info.identifiers).sort(), [
      'employee_code',
      'pan',
      'uan',
    ]);

    assert.ok('job_details' in dto);
    assert.ok('about' in dto);
    assert.ok('love_about_job' in dto);
    assert.ok('resume' in dto && 'has_pdf' in dto.resume);
    assert.deepEqual(dto.skills.map((s) => s.name).sort(), [
      'Accessibility',
      'CSS',
      'JavaScript',
      'React',
    ]);
    assert.equal(dto.certifications.length, 1);

    // Employees never receive account-security state through this API
    assert.ok(!('security' in dto));
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes('password_hash'));
  });

  test("another employee's profile is strictly read-only public content", async () => {
    const res = await getProfile(employee, sarahId);
    assert.equal(res.status, 200);
    const dto = res.body.data;

    assert.equal(dto.viewer, 'other');
    assert.equal(dto.can_edit, false);
    assert.deepEqual(dto.editable_fields, []);

    const forbidden = [
      'private_info',
      'job_details',
      'resume',
      'security',
      'email',
      'phone',
      'login_id',
      'date_of_birth',
      'pan',
      'bank_details',
    ];
    for (const key of forbidden) {
      assert.ok(!(key in dto), `${key} must not be exposed to other employees`);
    }
    assert.ok(!JSON.stringify(res.body).includes('sarah.connor@dayflow.io'));

    // Public content stays visible
    assert.equal(dto.about, 'HR specialist handling onboarding and people operations.');
    assert.equal(dto.skills.length, 3);
    assert.equal(dto.certifications.length, 1);
    assert.ok(dto.hired_at);
    assert.equal(dto.full_name, 'Sarah Connor');
  });

  test('admin receives the full DTO including the security/account block', async () => {
    const res = await getProfile(admin, michaelId);
    assert.equal(res.status, 200);
    const dto = res.body.data;

    assert.equal(dto.viewer, 'manager');
    assert.equal(dto.can_edit, true);
    assert.ok('private_info' in dto);
    assert.ok('resume' in dto);

    assert.equal(dto.security.login_id, 'MIDO20220001');
    assert.equal(dto.security.role, 'employee');
    assert.equal(dto.security.account_status, 'active');
    assert.equal(dto.security.must_change_password, false);
    assert.equal(dto.security.employee_id, michaelId);
    assert.ok(!JSON.stringify(res.body).toLowerCase().includes('password_hash'));
  });

  test('hr (manager-role) receives the same privileged DTO', async () => {
    const res = await getProfile(hr, michaelId);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.viewer, 'manager');
    assert.ok(res.body.data.security);
  });

  test('unknown employee id returns 404', async () => {
    const res = await getProfile(admin, 999999);
    assert.equal(res.status, 404);
  });

  test('no viewer ever sees compensation fields', async () => {
    for (const [who, id] of [
      [employee, michaelId],
      [employee, sarahId],
      [admin, michaelId],
    ]) {
      const res = await getProfile(who, id);
      assert.ok(
        !/(salary|ctc|compensation|password_hash)"?\s*:/i.test(JSON.stringify(res.body)),
        'compensation or credential fields leaked'
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3. PUT /profile — employee editing own record
// ---------------------------------------------------------------------------

describe('PUT /profile as employee (own record)', () => {
  test('updates all permitted personal fields and persists them', async () => {
    const res = await putProfile(employee, michaelId, {
      phone: '+91 90000 11111',
      date_of_birth: '1995-04-12',
      address: 'Indiranagar, Bengaluru',
      personal_email: 'Michael.Doe@Personal.io',
      gender: 'Male',
      nationality: 'Indian',
      marital_status: 'Single',
      about: 'I build design systems.',
      love_about_job: 'Shipping pixel-perfect UI.',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.private_info.personal_email, 'michael.doe@personal.io');

    const view = await getProfile(employee, michaelId);
    const info = view.body.data.private_info;
    assert.equal(info.phone, '+91 90000 11111');
    assert.equal(info.date_of_birth, '1995-04-12');
    assert.equal(info.address, 'Indiranagar, Bengaluru');
    assert.equal(info.personal_email, 'michael.doe@personal.io');
    assert.equal(view.body.data.about, 'I build design systems.');
    assert.equal(view.body.data.love_about_job, 'Shipping pixel-perfect UI.');
  });

  test('rejects every employment/identifier/bank field for employees', async () => {
    const attempts = [
      ['email', 'michael@evil.io'],
      ['position', 'CEO'],
      ['department', 'Engineering'],
      ['company', 'EvilCorp'],
      ['location', 'Nowhere'],
      ['manager_id', 1],
      ['hired_at', '2020-01-01'],
      ['employee_code', 'EMP01'],
      ['pan', 'ABCDE1234F'],
      ['uan', '123456789012'],
      ['bank_name', 'Evil Bank'],
      ['bank_account_number', '1234567890'],
      ['bank_ifsc', 'HDFC0001234'],
    ];
    for (const [field, value] of attempts) {
      const res = await putProfile(employee, michaelId, { [field]: value });
      assert.equal(res.status, 400, `${field} must be rejected`);
      assert.ok(detailFields(res).includes(field));
    }
    const view = await getProfile(admin, michaelId);
    assert.equal(view.body.data.position, 'Frontend Developer');
    assert.equal(view.body.data.private_info.email, 'michael.doe@dayflow.io');
    assert.equal(view.body.data.private_info.identifiers.pan, null);
  });

  test('rejects account-security and salary fields outright', async () => {
    for (const [field, value] of [
      ['role', 'admin'],
      ['login_id', 'HACK0001'],
      ['account_status', 'disabled'],
      ['must_change_password', 0],
      ['password_hash', 'owned'],
      ['token_version', 99],
      ['salary', 999999],
    ]) {
      const res = await putProfile(employee, michaelId, { [field]: value });
      assert.equal(res.status, 400, `${field} injection must be rejected`);
    }
  });

  test('a mixed payload is rejected atomically (valid part is not applied)', async () => {
    const res = await putProfile(employee, michaelId, { about: 'Tampered', salary: 100 });
    assert.equal(res.status, 400);
    const view = await getProfile(employee, michaelId);
    assert.equal(view.body.data.about, 'I build design systems.');
  });

  test('server-side validation reports precise field errors', async () => {
    const res = await putProfile(employee, michaelId, {
      date_of_birth: 'not-a-date',
      personal_email: 'nope',
      address: 'x'.repeat(501),
      gender: 123,
      phone: 'call-me-maybe',
    });
    assert.equal(res.status, 400);
    const fields = detailFields(res);
    for (const expected of [
      'date_of_birth',
      'personal_email',
      'address',
      'gender',
      'phone',
    ]) {
      assert.ok(fields.includes(expected), `expected error on ${expected}`);
    }
  });

  test('empty update body is rejected', async () => {
    const res = await putProfile(employee, michaelId, {});
    assert.equal(res.status, 400);
    assert.equal(detailFields(res)[0], 'body');
  });

  test('employee cannot edit another employee and nothing changes', async () => {
    const res = await putProfile(employee, sarahId, { about: 'hacked' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');

    const view = await getProfile(hr, sarahId);
    assert.equal(
      view.body.data.about,
      'HR specialist handling onboarding and people operations.'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. PUT /profile — admin / hr
// ---------------------------------------------------------------------------

describe('PUT /profile as admin/hr', () => {
  test('admin edits job details, work email, bank details and identifiers', async () => {
    const res = await putProfile(admin, davidId, {
      company: 'Dayflow Labs',
      location: 'Bengaluru',
      department: 'Engineering',
      position: 'Senior Backend Developer',
      hired_at: '2022-09-05',
      email: 'david.work@dayflow.io',
      manager_id: sarahId,
      bank_name: 'HDFC Bank',
      bank_account_number: '5010 0123 4567',
      bank_ifsc: 'hdfc0001234',
      employee_code: 'DF-1006',
      pan: 'abcde1234f',
      uan: '101234567890',
    });
    assert.equal(res.status, 200);

    const view = await getProfile(admin, davidId);
    const dto = view.body.data;
    assert.equal(dto.job_details.company, 'Dayflow Labs');
    assert.equal(dto.job_details.location, 'Bengaluru');
    assert.equal(dto.job_details.position, 'Senior Backend Developer');
    assert.equal(dto.job_details.manager.id, sarahId);
    assert.equal(dto.job_details.manager.full_name, 'Sarah Connor');
    assert.equal(dto.private_info.email, 'david.work@dayflow.io');
    assert.equal(dto.private_info.bank_details.bank_name, 'HDFC Bank');
    assert.equal(dto.private_info.bank_details.account_number, '501001234567');
    assert.equal(dto.private_info.bank_details.ifsc_code, 'HDFC0001234');
    assert.equal(dto.private_info.identifiers.employee_code, 'DF-1006');
    assert.equal(dto.private_info.identifiers.pan, 'ABCDE1234F');
    assert.equal(dto.private_info.identifiers.uan, '101234567890');
  });

  test('admin submissions failing validation are rejected with field errors', async () => {
    const attempts = [
      [{ department: 'Executive' }, 'department'],
      [{ pan: '12345' }, 'pan'],
      [{ uan: '12345' }, 'uan'],
      [{ bank_ifsc: 'HDFC123' }, 'bank_ifsc'],
      [{ bank_account_number: 'abcd' }, 'bank_account_number'],
      [{ manager_id: 999999 }, 'manager_id'],
      [{ manager_id: davidId }, 'manager_id'],
      [{ hired_at: '2024-13-40' }, 'hired_at'],
      [{ email: 'not-an-email' }, 'email'],
    ];
    for (const [payload, field] of attempts) {
      const res = await putProfile(admin, davidId, payload);
      assert.equal(res.status, 400, `${JSON.stringify(payload)} must fail`);
      assert.ok(detailFields(res).includes(field));
    }
  });

  test('uniqueness of work email and PAN is enforced across employees', async () => {
    const dupEmail = await putProfile(admin, michaelId, { email: 'david.work@dayflow.io' });
    assert.equal(dupEmail.status, 400);
    assert.equal(detailFields(dupEmail)[0], 'email');

    const dupPan = await putProfile(admin, michaelId, { pan: 'ABCDE1234F' });
    assert.equal(dupPan.status, 400);
    assert.equal(detailFields(dupPan)[0], 'pan');
  });

  test('security and salary fields are rejected even for admins', async () => {
    for (const [field, value] of [
      ['role', 'employee'],
      ['login_id', 'NEWID001'],
      ['account_status', 'disabled'],
      ['password_hash', 'x'],
      ['salary', 1],
    ]) {
      const res = await putProfile(admin, michaelId, { [field]: value });
      assert.equal(res.status, 400, `admin ${field} must be rejected here`);
    }
  });

  test('unknown employee id returns 404', async () => {
    const res = await putProfile(admin, 999999, { company: 'X' });
    assert.equal(res.status, 404);
  });

  test('hr can edit another employee’s personal fields', async () => {
    const res = await putProfile(hr, michaelId, { marital_status: 'Married' });
    assert.equal(res.status, 200);
    const view = await getProfile(employee, michaelId);
    assert.equal(view.body.data.private_info.marital_status, 'Married');
  });
});

// ---------------------------------------------------------------------------
// 5. Skills — add/remove
// ---------------------------------------------------------------------------

describe('skills POST/DELETE permission matrix', () => {
  test('employee adds a skill to own profile', async () => {
    const res = await addSkill(employee, michaelId, { name: 'Go' });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.id > 0);
    assert.equal(res.body.data.name, 'Go');

    const skills = await skillListOf(employee, michaelId);
    assert.ok(skills.some((s) => s.name === 'Go'));
  });

  test('duplicate skills are rejected case-insensitively', async () => {
    const res = await addSkill(employee, michaelId, { name: 'react' });
    assert.equal(res.status, 400);
    assert.match(res.body.error.details[0].message, /[Dd]uplicate skill/);
  });

  test('invalid skill payloads are rejected server-side', async () => {
    for (const body of [undefined, {}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(61) }, { name: 42 }]) {
      const res = await addSkill(employee, michaelId, body);
      assert.equal(res.status, 400, `payload ${JSON.stringify(body)} must fail`);
      assert.equal(detailFields(res)[0], 'name');
    }
  });

  test('employee cannot add a skill for someone else; state unchanged', async () => {
    const beforeList = await skillListOf(admin, sarahId);
    const res = await addSkill(employee, sarahId, { name: 'H4x' });
    assert.equal(res.status, 403);
    const afterList = await skillListOf(admin, sarahId);
    assert.equal(afterList.length, beforeList.length);
    assert.ok(!afterList.some((s) => s.name === 'H4x'));
  });

  test('admin and hr can manage another employee’s skills', async () => {
    const asAdmin = await addSkill(admin, sarahId, { name: 'Talent Analytics' });
    assert.equal(asAdmin.status, 201);

    const asHr = await addSkill(hr, michaelId, { name: 'People Ops' });
    assert.equal(asHr.status, 201);
  });

  test('owner deletes own skill by id; deleting again 404s', async () => {
    const skills = await skillListOf(employee, michaelId);
    const target = skills.find((s) => s.name === 'Go');
    assert.ok(target, 'Go should exist');

    const del = await deleteSkill(employee, michaelId, target.id);
    assert.equal(del.status, 200);
    assert.equal(del.body.data.id, target.id);
    assert.ok(!del.body.data.skills.some((s) => s.id === target.id));

    const repeat = await deleteSkill(employee, michaelId, target.id);
    assert.equal(repeat.status, 404);
  });

  test('malformed resource ids are rejected with 400', async () => {
    for (const bad of ['abc', '-1', '1.5', '0']) {
      const res = await deleteSkill(employee, michaelId, bad);
      assert.equal(res.status, 400);
      assert.equal(detailFields(res)[0], 'skillId');
    }
  });

  test('a skill id belonging to another employee cannot be deleted (scoped)', async () => {
    const sarahSkills = await skillListOf(admin, sarahId);
    const foreignId = sarahSkills[0].id;

    const res = await deleteSkill(employee, michaelId, foreignId);
    assert.equal(res.status, 404);

    const adminDel = await deleteSkill(admin, sarahId, foreignId);
    assert.equal(adminDel.status, 200);
  });

  test('skill collection cap of 50 is enforced', async () => {
    let skills = await skillListOf(employee, michaelId);
    for (let i = skills.length + 1; i <= 50; i += 1) {
      const res = await addSkill(employee, michaelId, { name: `CapSkill ${String(i).padStart(2, '0')}` });
      assert.equal(res.status, 201);
    }
    const overflow = await addSkill(employee, michaelId, { name: 'One Too Many' });
    assert.equal(overflow.status, 400);
    assert.match(overflow.body.error.details[0].message, /maximum of 50/);
  });
});

// ---------------------------------------------------------------------------
// 6. Certifications — add/remove
// ---------------------------------------------------------------------------

describe('certifications POST/DELETE permission matrix', () => {
  test('employee adds a certification to own profile', async () => {
    const res = await addCertification(employee, michaelId, {
      name: 'AWS Certified Cloud Practitioner',
      issuer: 'Amazon',
      issued_on: '2024-01-15',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.id > 0);
    assert.equal(res.body.data.issuer, 'Amazon');
    assert.equal(res.body.data.expires_on, null);

    const certs = await certificationListOf(employee, michaelId);
    assert.equal(certs.length, 2);
  });

  test('certification validation rejects bad entries precisely', async () => {
    const attempts = [
      [{ issuer: 'Ghost' }, 'name'],
      [{ name: 'x'.repeat(121) }, 'name'],
      [{ name: 'Ok', issuer: 'x'.repeat(121) }, 'issuer'],
      [{ name: 'Ok', issued_on: '15-01-2024' }, 'issued_on'],
      [{ name: 'Ok', issued_on: '2024-01-15', expires_on: 'soon' }, 'expires_on'],
      [{ name: 'Ok', issued_on: '2024-02-01', expires_on: '2024-01-31' }, 'expires_on'],
    ];
    for (const [body, field] of attempts) {
      const res = await addCertification(employee, michaelId, body);
      assert.equal(res.status, 400, `payload ${JSON.stringify(body)} must fail`);
      assert.ok(detailFields(res).includes(field), `expected error on ${field}`);
    }
    const certs = await certificationListOf(employee, michaelId);
    assert.equal(certs.length, 2, 'failed adds must not persist');
  });

  test('employee cannot add a certification for someone else', async () => {
    const res = await addCertification(employee, davidId, { name: 'Hacked Cert' });
    assert.equal(res.status, 403);
  });

  test('admin can add a certification for another employee', async () => {
    const res = await addCertification(admin, davidId, {
      name: 'Certified Kubernetes Administrator',
      issuer: 'CNCF',
      issued_on: '2023-05-01',
      expires_on: '2025-05-01',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.id > 0);
  });

  test('owner deletes own certification; repeating 404s', async () => {
    const certs = await certificationListOf(employee, michaelId);
    const target = certs.find((c) => c.name === 'AWS Certified Cloud Practitioner');
    assert.ok(target);

    const del = await deleteCertification(employee, michaelId, target.id);
    assert.equal(del.status, 200);
    assert.equal(del.body.data.id, target.id);
    assert.equal(del.body.data.certifications.length, 1);

    const repeat = await deleteCertification(employee, michaelId, target.id);
    assert.equal(repeat.status, 404);
  });

  test('malformed certification ids are rejected with 400', async () => {
    for (const bad of ['abc', '-3']) {
      const res = await deleteCertification(employee, michaelId, bad);
      assert.equal(res.status, 400);
      assert.equal(detailFields(res)[0], 'certificationId');
    }
  });

  test('foreign certification ids cannot be deleted by an employee', async () => {
    const davidCerts = await certificationListOf(admin, davidId);
    const foreignId = davidCerts[0].id;

    const res = await deleteCertification(employee, michaelId, foreignId);
    assert.equal(res.status, 404);

    const adminDel = await deleteCertification(admin, davidId, foreignId);
    assert.equal(adminDel.status, 200);
  });
});
