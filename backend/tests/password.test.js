import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { bootstrap, cleanup } from './helpers.js';
import {
  generateTempPassword,
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  PASSWORD_MIN_LENGTH,
  TEMP_PASSWORD_LENGTH,
} from '../src/utils/password.js';

const PASSWORD_UTIL_PATH = fileURLToPath(new URL('../src/utils/password.js', import.meta.url));
const SAMPLE_SIZE = 200;

let request;
let dbPath;
let hr;

before(async () => {
  ({ request, dbPath } = await bootstrap());
  const res = await request.post('/api/auth/login').send({
    email: 'hr@dayflow.com',
    password: 'Hr@123456',
  });
  hr = { cookie: res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ') };
});

after(() => cleanup(dbPath));

test('generated temporary passwords have the configured length', () => {
  for (let i = 0; i < SAMPLE_SIZE; i += 1) {
    assert.equal(generateTempPassword().length, TEMP_PASSWORD_LENGTH);
    assert.ok(generateTempPassword().length >= PASSWORD_MIN_LENGTH);
  }
});

test('custom lengths are honored and below-policy lengths are rejected', () => {
  for (const length of [PASSWORD_MIN_LENGTH, 16, 32]) {
    assert.equal(generateTempPassword(length).length, length);
  }
  assert.throws(() => generateTempPassword(PASSWORD_MIN_LENGTH - 1), RangeError);
  assert.throws(() => generateTempPassword(7), RangeError);
  assert.throws(() => generateTempPassword(11.5), RangeError);
  assert.throws(() => generateTempPassword('12'), RangeError);
});

test('every generated password satisfies the application password policy', () => {
  for (let i = 0; i < SAMPLE_SIZE; i += 1) {
    const password = generateTempPassword();
    assert.deepEqual(validatePasswordPolicy(password), [], `policy rejected: ${password}`);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /\d/);
  }
});

test('generated passwords avoid ambiguous characters', () => {
  const ambiguous = /[IOl10]/;
  for (let i = 0; i < SAMPLE_SIZE; i += 1) {
    assert.doesNotMatch(generateTempPassword(), ambiguous);
  }
});

test('randomness comes from node:crypto, never Math.random', () => {
  const source = fs.readFileSync(PASSWORD_UTIL_PATH, 'utf8');
  assert.doesNotMatch(source, /\bMath\.random\b/, 'Math.random must not be used');
  assert.match(source, /from 'node:crypto'/, 'must import node:crypto');
  assert.match(source, /crypto\.random(Int|Bytes|Fill)\(/, 'must use the CSPRNG API');
});

test('generation is unpredictable: samples do not collide or repeat patterns', () => {
  const seen = new Set();
  for (let i = 0; i < SAMPLE_SIZE; i += 1) {
    seen.add(generateTempPassword());
  }
  assert.equal(seen.size, SAMPLE_SIZE, 'collisions across samples should be practically impossible');
});

test('hashes are bcrypt digests and verify against the original plaintext', async () => {
  const temp = generateTempPassword();
  const hash = hashPassword(temp);

  assert.notEqual(hash, temp, 'plaintext must not equal its stored form');
  assert.match(hash, /^\$2[aby]\$/, 'stored value must be a bcrypt hash');

  assert.equal(await verifyPassword(temp, hash), true, 'correct password verifies');
  assert.equal(await verifyPassword(`${temp}x`, hash), false, 'wrong password fails');
  assert.equal(await verifyPassword('', hash), false);
  assert.equal(await verifyPassword(temp, ''), false);
});

test('provisioned plaintext exists only in the provisioning response, never in storage or list APIs', async () => {
  const provisionRes = await request
    .post('/api/employees')
    .set('Cookie', hr.cookie)
    .send({
      first_name: 'Secure',
      last_name: 'Storage',
      email: `secure.storage.${Date.now()}@dayflow.io`,
      position: 'Engineer',
      department: 'Engineering',
    });
  assert.equal(provisionRes.status, 201);

  const { id } = provisionRes.body.data;
  const { login_id: loginId, temp_password: tempPassword } = provisionRes.body.data.account;

  const dbFile = new Database(dbPath, { readonly: true });
  const user = dbFile.prepare('SELECT * FROM users WHERE login_id = ?').get(loginId);
  dbFile.close();

  assert.ok(user, 'account row must exist');
  assert.notEqual(user.password_hash, tempPassword);
  assert.doesNotMatch(user.password_hash, new RegExp(tempPassword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(user.password_hash, /^\$2[aby]\$/);
  assert.equal(user.must_change_password, 1, 'account must be flagged for a password change');

  const list = await request.get('/api/employees').set('Cookie', hr.cookie);
  assert.equal(list.status, 200);
  assert.ok(!JSON.stringify(list.body).includes(tempPassword));

  const detail = await request.get(`/api/employees/${id}`).set('Cookie', hr.cookie);
  assert.equal(detail.status, 200);
  assert.ok(!JSON.stringify(detail.body).includes(tempPassword));
});
