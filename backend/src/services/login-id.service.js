import { AppError } from '../utils/errors.js';

/**
 * Employee Login ID generation.
 *
 * Format: FFLL + YYYY + SSSS
 *   FFLL = first two letters of the normalized first name, then of the last name
 *   YYYY = joining year, derived from the employee's hiring date
 *   SSSS = zero-padded serial number, unique per FFLL+YYYY base
 *
 * Example: John Doe joining in 2022 -> JODO20220001, JODO20220002, ...
 *
 * Name normalization rules (applied to both names, identically):
 *   1. Accents are folded to their base letter ("José" -> "Jose").
 *   2. Every character that is not an ASCII letter is removed BEFORE initials
 *      are taken. This covers spaces, hyphens, apostrophes, dots, digits and
 *      any other punctuation: "Mary Jane" -> MA, "Jean-Luc" -> JE,
 *      "O'Neil" -> ON, "van der Berg" -> VA.
 *   3. The result is uppercased.
 *   4. Names yielding fewer than two letters are right-padded with "X":
 *      "A" -> AX, "" or "123" -> XX. Generation therefore never fails on
 *      short or empty input.
 *
 * Serial allocation:
 *   - The next serial is one higher than the highest serial already stored for
 *     the same base. Freed serials are never reused, so IDs stay stable in
 *     audit history even after employees are deleted.
 *   - Serials run from 0001 to 9999 per name/year base; beyond that a 409
 *     LOGIN_ID_EXHAUSTED error is raised instead of producing duplicates.
 *
 * Concurrency & integrity:
 *   - better-sqlite3 is synchronous, so generation within one process is
 *     serialized by construction. For multi-process access to the same SQLite
 *     file the read-max/allocate step runs inside a BEGIN IMMEDIATE
 *     transaction, taking the database's single writer lock up front.
 *   - The UNIQUE COLLATE NOCASE constraint on users.login_id is the final
 *     safety net: a lost race makes the INSERT fail loudly rather than ever
 *     overwriting an existing Login ID. This service only ever produces fresh
 *     IDs; it never updates or rewrites existing ones.
 *
 * This module is pure domain logic: it takes a database handle as an argument
 * and knows nothing about HTTP, controllers or requests.
 */

const MAX_SERIAL = 9999;
const SERIAL_WIDTH = 4;

export function normalizeNamePart(value) {
  const folded = String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase();
  const letters = folded.replace(/[^A-Z]/g, '');
  return letters.slice(0, 2).padEnd(2, 'X');
}

export function buildCandidate(firstName, lastName, year, serial) {
  return `${normalizeNamePart(firstName)}${normalizeNamePart(lastName)}${year}${String(
    serial
  ).padStart(SERIAL_WIDTH, '0')}`;
}

export function joiningYear(hiredAt) {
  if (hiredAt instanceof Date && !Number.isNaN(hiredAt.getTime())) {
    return hiredAt.getUTCFullYear();
  }
  if (typeof hiredAt === 'string') {
    const match = /^(\d{4})/.exec(hiredAt.trim());
    if (match) return Number(match[1]);
  }
  if (typeof hiredAt === 'number' && Number.isInteger(hiredAt)) {
    return hiredAt;
  }
  return new Date().getUTCFullYear();
}

function highestUsedSerial(db, base) {
  const rows = db.prepare('SELECT login_id FROM users WHERE login_id LIKE ?').all(`${base}%`);
  let highest = 0;
  for (const { login_id } of rows) {
    const match = new RegExp(`^${base}(\\d{${SERIAL_WIDTH}})$`).exec(String(login_id).toUpperCase());
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

export function generateLoginId(db, { firstName, lastName, hiredAt }) {
  const year = joiningYear(hiredAt);
  const base = buildCandidate(firstName, lastName, year, 0).slice(0, -SERIAL_WIDTH);
  const allocate = db.transaction(() => {
    const next = highestUsedSerial(db, base) + 1;
    if (next > MAX_SERIAL) {
      throw new AppError(
        409,
        'No free login ID available for this name and joining year',
        'LOGIN_ID_EXHAUSTED'
      );
    }
    return `${base}${String(next).padStart(SERIAL_WIDTH, '0')}`;
  });
  return allocate.immediate();
}
