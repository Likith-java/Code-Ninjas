import bcrypt from 'bcryptjs';
import { db } from '../config/db.js';
import { signToken } from '../middleware/auth.js';

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: { message: 'Email and password are required' } });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim());
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: { message: 'Invalid email or password' } });
    }
    const token = signToken(user);
    res.cookie('token', token, cookieOptions());
    return res.json({
      data: { id: user.id, email: user.email, role: user.role, employee_id: user.employee_id },
    });
  } catch (err) {
    return next(err);
  }
}

export function me(req, res) {
  return res.json({ data: req.user });
}

export function logout(req, res) {
  res.clearCookie('token');
  return res.json({ data: { message: 'Logged out' } });
}
