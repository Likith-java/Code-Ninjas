import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} not found`, code: 'NOT_FOUND' },
  });
}

export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    return res
      .status(400)
      .json({ error: { message: 'Malformed JSON body', code: 'VALIDATION_FAILED' } });
  }
  if (err instanceof AppError) {
    const payload = { message: err.message, code: err.code };
    if (err.details !== undefined) payload.details = err.details;
    return res.status(err.status).json({ error: payload });
  }
  console.error('[error]', err);
  return res.status(500).json({ error: { message: 'Internal server error', code: 'INTERNAL' } });
}
