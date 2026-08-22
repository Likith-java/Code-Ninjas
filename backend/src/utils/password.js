import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

// Ambiguous characters (I, O, l, 1, 0) excluded for usability when read aloud or transcribed.
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL_CHARACTERS = UPPERCASE + LOWERCASE + DIGITS;

export const PASSWORD_MIN_LENGTH = 8;
export const TEMP_PASSWORD_LENGTH = 12;

function pickFrom(charset) {
  // crypto.randomInt uses rejection sampling over randomBytes, so every
  // character is selected uniformly (no modulo bias).
  return charset[crypto.randomInt(charset.length)];
}

export function generateTempPassword(length = TEMP_PASSWORD_LENGTH) {
  if (!Number.isInteger(length) || length < PASSWORD_MIN_LENGTH) {
    throw new RangeError(`Temporary password length must be an integer >= ${PASSWORD_MIN_LENGTH}`);
  }

  // Seed one character from each category required by validatePasswordPolicy so
  // policy compliance is guaranteed rather than probabilistic, then fill the
  // rest uniformly from the full alphabet.
  const chars = [
    pickFrom(UPPERCASE),
    pickFrom(LOWERCASE),
    pickFrom(DIGITS),
    ...Array.from({ length: length - 3 }, () => pickFrom(ALL_CHARACTERS)),
  ];

  // Fisher-Yates shuffle keyed by the CSPRNG so required characters land at
  // unpredictable positions instead of always leading the password.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), 10);
}

export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(String(plain), hash);
}

export function validatePasswordPolicy(password) {
  const errors = [];
  const value = typeof password === 'string' ? password : '';
  if (value.length < PASSWORD_MIN_LENGTH) {
    errors.push({ field: 'new_password', message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
  }
  if (!/[a-z]/.test(value)) {
    errors.push({ field: 'new_password', message: 'Password must contain a lowercase letter' });
  }
  if (!/[A-Z]/.test(value)) {
    errors.push({ field: 'new_password', message: 'Password must contain an uppercase letter' });
  }
  if (!/\d/.test(value)) {
    errors.push({ field: 'new_password', message: 'Password must contain a digit' });
  }
  return errors;
}
