import jwt from 'jsonwebtoken';
import { db } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dayflow-dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, ver: Number(user.token_version ?? 0) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function getToken(req) {
  if (req.cookies?.token) return req.cookies.token;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export function requireAuth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) {
      return res
        .status(401)
        .json({ error: { message: 'Authentication required', code: 'UNAUTHENTICATED' } });
    }
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare(
        `SELECT id, login_id, email, role, employee_id, must_change_password, account_status,
                token_version
         FROM users WHERE id = ?`
      )
      .get(payload.sub);
    if (!user || user.account_status === 'disabled') {
      return res
        .status(401)
        .json({ error: { message: 'Invalid or expired session', code: 'UNAUTHENTICATED' } });
    }
    // Tokens issued before a password change/reset carry a stale version and
    // are treated as revoked.
    if (Number(payload.ver ?? 0) !== Number(user.token_version ?? 0)) {
      return res
        .status(401)
        .json({ error: { message: 'Invalid or expired session', code: 'UNAUTHENTICATED' } });
    }
    req.user = {
      ...user,
      must_change_password: Boolean(user.must_change_password),
    };
    return next();
  } catch {
    return res
      .status(401)
      .json({ error: { message: 'Invalid or expired session', code: 'UNAUTHENTICATED' } });
  }
}


