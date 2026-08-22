import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  buildCandidate,
  generateLoginId,
  joiningYear,
  normalizeNamePart,
} from '../src/services/login-id.service.js';
import { AppError } from '../src/utils/errors.js';

test('buildCandidate follows the PRD format', () => {
  assert.equal(buildCandidate('John', 'Doe', 2022, 1), 'JODO20220001');
});

test('serial numbers are zero-padded to four digits', () => {
  assert.equal(buildCandidate('John', 'Doe', 2022, 42), 'JODO20220042');
  assert.equal(buildCandidate('John', 'Doe', 2022, 9999), 'JODO20229999');
});

test('normalizeNamePart strips spaces, hyphens and apostrophes before taking initials', () => {
  assert.equal(normalizeNamePart('Mary Jane'), 'MA');
  assert.equal(normalizeNamePart('Jean-Luc'), 'JE');
  assert.equal(normalizeNamePart("O'Neil"), 'ON');
  assert.equal(normalizeNamePart('van der Berg'), 'VA');
});

test('normalizeNamePart folds accented letters to their base letter', () => {
  assert.equal(normalizeNamePart('José'), 'JO');
  assert.equal(normalizeNamePart('Böb'), 'BO');
});

test('names shorter than two letters are padded with X', () => {
  assert.equal(normalizeNamePart('A'), 'AX');
  assert.equal(buildCandidate('A', 'B', 2026, 1), 'AXBX20260001');
});

test('letter-less or empty names degrade safely to XX without throwing', () => {
  assert.equal(normalizeNamePart(''), 'XX');
  assert.equal(normalizeNamePart('123'), 'XX');
  assert.equal(normalizeNamePart(null), 'XX');
  assert.equal(buildCandidate('', '', 2026, 1), 'XXXX20260001');
});

test('lowercase names produce uppercase IDs', () => {
  assert.equal(buildCandidate('john', 'doe', 2022, 1), 'JODO20220001');
});

function setupDb() {
  const db = new Database(':memory:');
  db.exec(
    'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, login_id TEXT NOT NULL UNIQUE COLLATE NOCASE)'
  );
  return db;
}

test('first employee with unique initials gets serial 0001', () => {
  const db = setupDb();
  const id = generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-04-11' });
  assert.equal(id, 'JODO20220001');
});

test('second employee with same initials and year gets serial 0002', () => {
  const db = setupDb();
  const first = generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-04-11' });
  db.prepare('INSERT INTO users (login_id) VALUES (?)').run(first);
  const second = generateLoginId(db, { firstName: 'Jo', lastName: 'Doe', hiredAt: '2022-09-05' });
  assert.equal(second, 'JODO20220002');
});

test('multiple collisions keep incrementing the serial', () => {
  const db = setupDb();
  const insert = db.prepare('INSERT INTO users (login_id) VALUES (?)');
  const names = [
    { firstName: 'John', lastName: 'Doe' },
    { firstName: 'Joan', lastName: 'Donovan' },
    { firstName: 'Joe', lastName: 'Dore' },
  ];
  const ids = names.map((name) => {
    const id = generateLoginId(db, { ...name, hiredAt: '2022-03-03' });
    insert.run(id);
    return id;
  });
  assert.deepEqual(ids, ['JODO20220001', 'JODO20220002', 'JODO20220003']);
});

test('joining year changes start independent sequences', () => {
  const db = setupDb();
  const insert = db.prepare('INSERT INTO users (login_id) VALUES (?)');
  for (const [year, expected] of [
    ['2019-02-02', 'JARO20190001'],
    ['2020-06-30', 'JARO20200001'],
  ]) {
    const id = generateLoginId(db, { firstName: 'Jane', lastName: 'Roe', hiredAt: year });
    insert.run(id);
    assert.equal(id, expected);
  }
});

test('generateLoginId derives the year from hired_at', () => {
  const db = setupDb();
  assert.equal(
    generateLoginId(db, { firstName: 'Jane', lastName: 'Roe', hiredAt: '2019-02-02' }),
    'JARO20190001'
  );
});

test('a Date object hired_at contributes its year', () => {
  const db = setupDb();
  const id = generateLoginId(db, {
    firstName: 'Jane',
    lastName: 'Roe',
    hiredAt: new Date(Date.UTC(2021, 0, 15)),
  });
  assert.equal(id, 'JARO20210001');
});

test('missing or malformed hired_at falls back to the current year', () => {
  const current = new Date().getUTCFullYear();
  assert.equal(joiningYear(null), current);
  assert.equal(joiningYear(undefined), current);
  assert.equal(joiningYear('not-a-date'), current);
});

test('existing IDs with serial numbers continue after the highest one', () => {
  const db = setupDb();
  const insert = db.prepare('INSERT INTO users (login_id) VALUES (?)');
  insert.run('JODO20220005');
  insert.run('JODO20220012');
  const id = generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-01-01' });
  assert.equal(id, 'JODO20220013');
});

test('stored IDs are matched case-insensitively', () => {
  const db = setupDb();
  db.prepare('INSERT INTO users (login_id) VALUES (?)').run('jodo20220001');
  const id = generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-01-01' });
  assert.equal(id, 'JODO20220002');
});

test('freed serials are never reused', () => {
  const db = setupDb();
  const insert = db.prepare('INSERT INTO users (login_id) VALUES (?)');
  insert.run('JODO20220001');
  insert.run('JODO20220002');
  insert.run('JODO20220003');
  db.prepare('DELETE FROM users WHERE login_id = ?').run('JODO20220002');
  const id = generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-01-01' });
  assert.equal(id, 'JODO20220004');
});

test('generation works while an outer transaction is open (savepoint nesting)', () => {
  const db = setupDb();
  let generated;
  db.transaction(() => {
    generated = generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-01-01' });
  })();
  assert.equal(generated, 'JODO20220001');
});

test('the database UNIQUE constraint stays the final safety net', () => {
  const db = setupDb();
  db.prepare('INSERT INTO users (login_id) VALUES (?)').run('JODO20220001');
  assert.throws(
    () => db.prepare('INSERT INTO users (login_id) VALUES (?)').run('jodo20220001'),
    /UNIQUE/
  );
});

test('generateLoginId throws a 409 error when the serial space is exhausted', () => {
  const db = setupDb();
  const insert = db.prepare('INSERT INTO users (login_id) VALUES (?)');
  db.transaction(() => {
    for (let serial = 1; serial <= 9999; serial += 1) {
      insert.run(buildCandidate('John', 'Doe', 2022, serial));
    }
  })();
  try {
    generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-01-01' });
    assert.fail('expected LOGIN_ID_EXHAUSTED');
  } catch (err) {
    assert.ok(err instanceof AppError);
    assert.equal(err.status, 409);
    assert.equal(err.code, 'LOGIN_ID_EXHAUSTED');
  }
});
