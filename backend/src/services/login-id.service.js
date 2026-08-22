import { AppError } from '../utils/errors.js';

const MAX_SERIAL = 9999;

export function buildCandidate(firstName, lastName, year, serial) {
  const part = (value) =>
    String(value ?? '')
      .replace(/[^a-zA-Z]/g, '')
      .slice(0, 2)
      .padEnd(2, 'X')
      .toUpperCase();
  return `${part(firstName)}${part(lastName)}${year}${String(serial).padStart(4, '0')}`;
}

function yearOfJoining(hiredAt) {
  const raw = typeof hiredAt === 'string' && /^\d{4}/.test(hiredAt) ? hiredAt.slice(0, 4) : null;
  return raw ? Number(raw) : new Date().getFullYear();
}

export function generateLoginId(db, { firstName, lastName, hiredAt }) {
  const year = yearOfJoining(hiredAt);
  const exists = db.prepare('SELECT 1 FROM users WHERE login_id = ?');
  const tx = db.transaction(() => {
    for (let serial = 1; serial <= MAX_SERIAL; serial += 1) {
      const candidate = buildCandidate(firstName, lastName, year, serial);
      if (!exists.get(candidate)) {
        return candidate;
      }
    }
    throw new AppError(
      409,
      'No free login ID available for this name and joining year',
      'LOGIN_ID_EXHAUSTED'
    );
  });
  return tx();
}
