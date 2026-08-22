export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

export function errorHandler(err, req, res, _next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Malformed JSON body' } });
  }
  console.error('[error]', err);
  const status = err.status || 500;
  return res.status(status).json({
    error: { message: status === 500 ? 'Internal server error' : err.message },
  });
}
