import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { buildCandidate, generateLoginId } from '../src/services/login-id.service.js';

test('buildCandidate follows the PRD format', () => {
  assert.equal(buildCandidate('John', 'Doe', 2022, 1), 'JODO20220001');
});

test('serial numbers are zero-padded to four digits', () => {
  assert.equal(buildCandidate('John', 'Doe', 2022, 42), 'JODO20220042');
  assert.equal(buildCandidate('John', 'Doe', 2022, 9999), 'JODO20229999');
});

test('names shorter than two letters are padded with X', () => {
  assert.equal(buildCandidate('A', 'B', 2026, 1), 'AXBX20260001');
});

test('non-alphabetic characters are stripped and output is uppercase', () => {
  assert.equal(buildCandidate('jean-luc', "o'neil", 2026, 7), 'JEON20260007');
});

function setupDb() {
  const db = new Database(':memory:');
  db.exec(
    'CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, login_id TEXT NOT NULL UNIQUE COLLATE NOCASE)'
  );
  return db;
}

test('generateLoginId skips taken identifiers', () => {
  const db = setupDb();
  const first = generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-04-11' });
  assert.equal(first, 'JODO20220001');
  db.prepare('INSERT INTO users (login_id) VALUES (?)').run(first);

  const second = generateLoginId(db, { firstName: 'Jo', lastName: 'Doe', hiredAt: '2022-09-05' });
  assert.equal(second, 'JODO20220002');
});

test('generateLoginId derives the year from hired_at', () => {
  const db = setupDb();
  const id = generateLoginId(db, { firstName: 'Jane', lastName: 'Roe', hiredAt: '2019-02-02' });
  assert.equal(id, 'JARO20190001');
});

test('generateLoginId throws when the space is exhausted', () => {
  const db = setupDb();
  const insert = db.prepare('INSERT INTO users (login_id) VALUES (?)');
  const tx = db.transaction(() => {
    for (let serial = 1; serial <= 9999; serial += 1) {
      insert.run(buildCandidate('John', 'Doe', 2022, serial));
    }
  });
  tx();
  assert.throws(
    () => generateLoginId(db, { firstName: 'John', lastName: 'Doe', hiredAt: '2022-01-01' }),
    /No free login ID/
  );
});
