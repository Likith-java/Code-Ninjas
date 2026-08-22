import { validatePasswordPolicy } from '../utils/password.js';

export function validateCredentials(body) {
  const errors = [];
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!identifier) {
    errors.push({ field: 'identifier', message: 'Login ID or email is required' });
  }
  if (!password) {
    errors.push({ field: 'password', message: 'Password is required' });
  }
  return { errors, identifier, password };
}

export function validateNewPassword(newPassword) {
  return validatePasswordPolicy(newPassword);
}
