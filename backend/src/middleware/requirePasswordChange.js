export function requirePasswordChange(req, res, next) {
  if (req.user?.must_change_password) {
    return res.status(403).json({
      error: {
        message: 'Password change required before continuing',
        code: 'PASSWORD_CHANGE_REQUIRED',
      },
    });
  }
  return next();
}
