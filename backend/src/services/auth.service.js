import { db } from '../config/db.js';
import { verifyPassword } from '../utils/password.js';

export function findUserByIdentifier(identifier) {
  return db
    .prepare('SELECT * FROM users WHERE email = ? OR login_id = ?')
    .get(identifier, identifier);
}

export async function authenticate(identifier, password) {
  const user = findUserByIdentifier(identifier);
  if (!user) return null;
  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) return null;
  if (user.account_status === 'disabled') return null;
  db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id);
  return user;
}

export function toSessionPayload(user) {
  return {
    id: user.id,
    email: user.email,
    login_id: user.login_id,
    role: user.role,
    employee_id: user.employee_id,
    must_change_password: Boolean(user.must_change_password),
    account_status: user.account_status,
  };
}
