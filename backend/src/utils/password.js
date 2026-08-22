import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export const PASSWORD_MIN_LENGTH = 8;

export function generateTempPassword(length = 12) {
  const bytes = crypto.randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i += 1) {
    password += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return password;
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
