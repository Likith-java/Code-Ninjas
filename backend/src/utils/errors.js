export class AppError extends Error {
  constructor(status, message, code = 'ERROR', details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function validationError(message, details) {
  return new AppError(400, message, 'VALIDATION_FAILED', details);
}

export function notFoundError(message = 'Resource not found') {
  return new AppError(404, message, 'NOT_FOUND');
}

export function forbiddenError(message = 'Insufficient permissions') {
  return new AppError(403, message, 'FORBIDDEN');
}
