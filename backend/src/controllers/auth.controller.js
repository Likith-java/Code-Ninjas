import { AppError } from '../utils/errors.js';
import { validateCredentials, validateNewPassword } from '../validators/auth.validator.js';
import {
  authenticate,
  toSessionPayload,
  findUserByIdentifier,
} from '../services/auth.service.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
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
    const body = req.body || {};
    const { errors, identifier, password } = validateCredentials({
      identifier: body.identifier ?? body.email,
      password: body.password,
    });
    if (errors.length) {
      throw new AppError(400, 'Validation failed', 'VALIDATION_FAILED', errors);
    }

    const user = await authenticate(identifier, password);
    if (!user) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const token = signToken(user);
    res.cookie('token', token, cookieOptions());
    return res.json({ data: toSessionPayload(user) });
  } catch (err) {
    return next(err);
  }
}

export function me(req, res) {
  return res.json({ data: toSessionPayload(req.user) });
}

export async function changePassword(req, res, next) {
  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      throw new AppError(400, 'Validation failed', 'VALIDATION_FAILED', [
        ...(currentPassword ? [] : [{ field: 'current_password', message: 'Current password is required' }]),
        ...(newPassword ? [] : [{ field: 'new_password', message: 'New password is required' }]),
      ]);
    }

    const policyErrors = validateNewPassword(newPassword);
    if (policyErrors.length) {
      throw new AppError(400, 'Validation failed', 'VALIDATION_FAILED', policyErrors);
    }

    const fullUser = db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(req.user.id);
    if (!fullUser) {
      throw new AppError(401, 'Invalid or expired session', 'UNAUTHENTICATED');
    }
    const matches = await verifyPassword(currentPassword, fullUser.password_hash);
    if (!matches) {
      throw new AppError(400, 'Current password is incorrect', 'INVALID_CREDENTIALS');
    }
    if (currentPassword === newPassword) {
      throw new AppError(400, 'Validation failed', 'VALIDATION_FAILED', [
        { field: 'new_password', message: 'New password must be different from the current one' },
      ]);
    }

    // Bumping token_version revokes every session issued before this change;
    // a fresh cookie keeps the current client signed in seamlessly.
    db.prepare(
      `UPDATE users
       SET password_hash = ?, must_change_password = 0,
           token_version = token_version + 1,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(hashPassword(newPassword), req.user.id);

    const updated = findUserByIdentifier(fullUser.login_id);
    res.cookie('token', signToken(updated), cookieOptions());
    return res.json({ data: toSessionPayload(updated) });
  } catch (err) {
    return next(err);
  }
}

export function logout(req, res) {
  res.clearCookie('token');
  return res.json({ data: { message: 'Logged out' } });
}
