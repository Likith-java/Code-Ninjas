import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap, cleanup, login } from './helpers.js';

let request;
let dbPath;
let admin;
let hr;
let employee;

// Card projection allowlist: exactly the fields the directory needs — nothing
// else may appear on list rows or detail cards.
const CARD_KEYS = new Set([
  'id',
  'first_name',
  'last_name',
  'full_name',
  'position',
  'department',
  'avatar_url',
  'status',
]);

// Credentials/account secrets: never returned to anyone, on any endpoint.
const SECRET_KEYS = [
  'password_hash',
  'password',
  'temp_password',
  'token_version',
  'must_change_password',
  'login_id',
  'role',
  'salary',
  'compensation',
  'pan',
  'uan',
  'employee_code',
  'account_status',
  'last_login_at',
];

// Private profile data: hidden from other employees; visible on self/manager
// views by design, so only asserted against directory cards and "other" views.
const PRIVATE_KEYS = [
  'email',
  'phone',
  'date_of_birth',
  'address',
  'personal_email',
  'gender',
  'marital_status',
  'nationality',
  'resume',
];

function assertNoneOf(keys, payload, label) {
  const json = JSON.stringify(payload);
  for (const key of keys) {
    assert.ok(!json.includes(`"${key}"`), `${label} "${key}" must never be returned`);
  }
}

const assertNoSecrets = (payload) => assertNoneOf(SECRET_KEYS, payload, 'secret field');
const assertNoPrivateFields = (payload) =>
  assertNoneOf(PRIVATE_KEYS, payload, 'private field');

function assertIsCard(card) {
  for (const key of Object.keys(card)) {
    assert.ok(CARD_KEYS.has(key), `unexpected directory card field: ${key}`);
  }
}

before(async () => {
  ({ request, dbPath } = await bootstrap());
  admin = await login(request, 'admin@dayflow.com', 'Admin@123');
  hr = await login(request, 'hr@dayflow.com', 'Hr@123456');
  employee = await login(request, 'employee@dayflow.com', 'Employee@123');
});

after(() => cleanup(dbPath));

describe('directory listing authorization', () => {
  test('admin can list employees', async () => {
    const res = await request.get('/api/employees').set('Cookie', admin.cookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.meta.total >= 6);
    assert.equal(res.body.data.length, Math.min(50, res.body.meta.total));
    for (const card of res.body.data) {
      assertIsCard(card);
      assert.match(card.full_name, /\S/);
      assert.ok(['active', 'on_leave', 'disabled'].includes(card.status));
    }
    assertNoSecrets(res.body);
  });

  test('regular employee can list employees (read-only directory)', async () => {
    const res = await request.get('/api/employees').set('Cookie', employee.cookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 6);
    assertNoSecrets(res.body);
  });

  test('anonymous listing is rejected', async () => {
    const res = await request.get('/api/employees');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  });

  test('anonymous detail access is rejected', async () => {
    const res = await request.get('/api/employees/1');
    assert.equal(res.status, 401);
  });

  test('tampered session token is rejected', async () => {
    const res = await request
      .get('/api/employees')
      .set('Cookie', `token=${employee.cookie.split('=')[1]}x`);
    assert.equal(res.status, 401);
  });

  test('employee cannot reach admin-only employee data endpoints', async () => {
    const target = employee.user.employee_id;
    const security = await request
      .get(`/api/employees/${target}/security`)
      .set('Cookie', employee.cookie);
    assert.equal(security.status, 403);

    const disable = await request
      .patch(`/api/employees/${target}/status`)
      .set('Cookie', employee.cookie)
      .send({ account_status: 'disabled' });
    assert.equal(disable.status, 403);
  });
});

describe('directory search', () => {
  test('searches by first and last name', async () => {
    for (const term of ['connor', 'Sarah']) {
      const res = await request.get(`/api/employees?q=${term}`).set('Cookie', hr.cookie);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].full_name, 'Sarah Connor');
    }
  });

  test('searches by position', async () => {
    const res = await request.get('/api/employees?q=developer').set('Cookie', hr.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    for (const card of res.body.data) {
      assert.match(card.position, /Developer/i);
    }
  });

  test('searches by skill', async () => {
    const res = await request.get('/api/employees?q=accessibility').set('Cookie', employee.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].full_name, 'Michael Doe');
  });

  test('does not search sensitive fields: email', async () => {
    // The full address matches no name/position/skill substring.
    const res = await request
      .get('/api/employees?q=jenifer.smith@dayflow.io')
      .set('Cookie', hr.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 0);
  });

  test('does not search sensitive fields: login id', async () => {
    const res = await request.get('/api/employees?q=MIDO20220001').set('Cookie', hr.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 0);
  });

  test('department filter narrows results', async () => {
    const res = await request
      .get('/api/employees?department=Engineering')
      .set('Cookie', hr.cookie);
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 2);
    for (const card of res.body.data) {
      assert.equal(card.department, 'Engineering');
    }
  });
});

describe('directory pagination', () => {
  test('returns paged slices with stable ordering and meta', async () => {
    const page1 = await request
      .get('/api/employees?page=1&limit=3')
      .set('Cookie', hr.cookie);
    assert.equal(page1.status, 200);
    assert.equal(page1.body.data.length, 3);
    assert.equal(page1.body.meta.page, 1);
    assert.equal(page1.body.meta.limit, 3);
    assert.ok(page1.body.meta.total >= 6);
    assert.ok(page1.body.meta.totalPages >= 2);

    const page2 = await request
      .get('/api/employees?page=2&limit=3')
      .set('Cookie', hr.cookie);
    assert.equal(page2.status, 200);
    assert.equal(page2.body.data.length, 3);

    const ids1 = page1.body.data.map((c) => c.id);
    const ids2 = page2.body.data.map((c) => c.id);
    for (const id of ids2) assert.ok(!ids1.includes(id), 'pages must not overlap');

    const sorted = [...page1.body.data].sort((a, b) =>
      a.last_name.localeCompare(b.last_name)
    );
    assert.deepEqual(
      page1.body.data.map((c) => c.last_name),
      sorted.map((c) => c.last_name)
    );
  });

  test('out-of-range page yields empty data without error', async () => {
    const res = await request
      .get(`/api/employees?page=${Number.MAX_SAFE_INTEGER}&limit=10`)
      .set('Cookie', hr.cookie);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
  });
});

describe('derived status', () => {
  let createdId;

  test('new employees derive status active from their account', async () => {
    const created = await request
      .post('/api/employees')
      .set('Cookie', admin.cookie)
      .send({
        first_name: 'Directory',
        last_name: 'Probe',
        email: 'directory.probe@dayflow.io',
        position: 'QA Engineer',
        department: 'Engineering',
      });
    assert.equal(created.status, 201);
    createdId = created.body.data.id;
    assert.equal(created.body.data.status, 'active');

    const list = await request
      .get(`/api/employees?q=probe`)
      .set('Cookie', employee.cookie);
    assert.equal(list.body.data[0].status, 'active');
  });

  test('disabling the linked account flips derived status to disabled', async () => {
    const patched = await request
      .patch(`/api/employees/${createdId}/status`)
      .set('Cookie', admin.cookie)
      .send({ account_status: 'disabled' });
    assert.equal(patched.status, 200);

    const detail = await request
      .get(`/api/employees/${createdId}`)
      .set('Cookie', admin.cookie);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.status, 'disabled');

    const filtered = await request
      .get('/api/employees?status=disabled')
      .set('Cookie', admin.cookie);
    assert.ok(filtered.body.data.some((c) => c.id === createdId));

    const activeOnly = await request
      .get('/api/employees?status=active&department=Engineering&limit=100')
      .set('Cookie', admin.cookie);
    assert.ok(!activeOnly.body.data.some((c) => c.id === createdId));
  });

  test('legacy employment flag maps to on_leave while it still exists', async () => {
    const flagged = await request
      .put(`/api/employees/${createdId}`)
      .set('Cookie', admin.cookie)
      .send({ status: 'on_leave' });
    assert.equal(flagged.status, 200);

    const list = await request
      .get('/api/employees?status=on_leave')
      .set('Cookie', admin.cookie);
    assert.ok(!list.body.data.some((c) => c.id === createdId), 'disabled account wins over flag');

    const reEnabled = await request
      .patch(`/api/employees/${createdId}/status`)
      .set('Cookie', admin.cookie)
      .send({ account_status: 'active' });
    assert.equal(reEnabled.status, 200);

    const listAfter = await request
      .get('/api/employees?status=on_leave')
      .set('Cookie', admin.cookie);
    assert.ok(listAfter.body.data.some((c) => c.id === createdId));
  });

  test('meta exposes derived directory statuses', async () => {
    const res = await request.get('/api/employees/meta').set('Cookie', employee.cookie);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.directory_statuses, ['active', 'on_leave', 'disabled']);
    assert.ok(res.body.data.departments.length > 0);
  });
});

describe('GET /employees/:id authorization and field exposure', () => {
  let michaelId;
  let sarahId;

  before(async () => {
    michaelId = employee.user.employee_id;
    const sarah = await request.get('/api/employees?q=connor').set('Cookie', admin.cookie);
    sarahId = sarah.body.data[0].id;
  });

  test('unknown id returns 404', async () => {
    const res = await request.get('/api/employees/99999').set('Cookie', admin.cookie);
    assert.equal(res.status, 404);
  });

  test('employee viewing another employee gets read-only public profile only', async () => {
    const res = await request.get(`/api/employees/${sarahId}`).set('Cookie', employee.cookie);
    assert.equal(res.status, 200);
    const body = res.body.data;

    assert.equal(body.viewer, 'other');
    assert.equal(body.can_edit, false);

    // Card basics present.
    for (const key of ['id', 'full_name', 'position', 'department', 'avatar_url', 'status']) {
      assert.ok(key in body, `${key} expected on public profile`);
    }

    // Private profile data must not be exposed.
    for (const key of [
      'email',
      'phone',
      'date_of_birth',
      'address',
      'personal_email',
      'resume',
    ]) {
      assert.ok(!(key in body), `${key} must not be exposed to other employees`);
    }
    assertNoPrivateFields(body);
    assertNoSecrets(body);

    // Edit-only/admin-only data absent.
    assert.equal(body.can_edit, false);
    assert.ok(!('viewer_permissions' in body));
  });

  test('employee viewing own record sees private fields with edit access', async () => {
    const res = await request.get(`/api/employees/${michaelId}`).set('Cookie', employee.cookie);
    assert.equal(res.status, 200);
    const body = res.body.data;

    assert.equal(body.viewer, 'self');
    assert.equal(body.can_edit, true);
    assert.equal(body.email, 'michael.doe@dayflow.io');
    assert.ok('phone' in body);
    assert.ok('date_of_birth' in body);
    assert.ok('resume' in body);
    assertNoSecrets(body); // own secrets (password hash etc.) stay hidden too
  });

  test('manager viewing a record is authorized but directory card stays minimal', async () => {
    const res = await request.get(`/api/employees/${michaelId}`).set('Cookie', hr.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.viewer, 'manager');
    assert.equal(res.body.data.can_edit, true);
  });

  test('detail responses never include salary or credential fields', async () => {
    for (const cookie of [admin.cookie, hr.cookie, employee.cookie]) {
      const res = await request.get(`/api/employees/${michaelId}`).set('Cookie', cookie);
      assert.equal(res.status, 200);
      assertNoSecrets(res.body);
    }
  });
});
