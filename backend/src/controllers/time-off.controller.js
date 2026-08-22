import {
  getTimeOffRequests,
  createTimeOffRequest,
  updateTimeOffStatus,
} from '../services/time-off.service.js';
import { AppError } from '../utils/errors.js';

export function listTimeOff(req, res, next) {
  try {
    const isManager = req.user.role === 'admin' || req.user.role === 'hr';
    let employeeId = req.query.employeeId;

    if (!isManager) {
      employeeId = req.user.employee_id;
    }

    const requests = getTimeOffRequests({
      employeeId,
      status: req.query.status,
    });

    return res.json({ data: requests });
  } catch (err) {
    return next(err);
  }
}

export function submitTimeOff(req, res, next) {
  try {
    const body = req.body || {};
    const isManager = req.user.role === 'admin' || req.user.role === 'hr';
    const employeeId = (isManager && body.employee_id) ? body.employee_id : req.user.employee_id;

    if (!employeeId) {
      throw new AppError(400, 'Employee ID is required', 'VALIDATION_FAILED');
    }

    if (!body.type || !['PAID', 'SICK', 'UNPAID'].includes(body.type)) {
      throw new AppError(400, 'Valid leave type (PAID, SICK, UNPAID) is required', 'VALIDATION_FAILED');
    }

    if (!body.start_date || !body.end_date) {
      throw new AppError(400, 'Start and end dates are required', 'VALIDATION_FAILED');
    }

    if (!body.reason) {
      throw new AppError(400, 'Reason is required', 'VALIDATION_FAILED');
    }

    const request = createTimeOffRequest({
      employeeId,
      type: body.type,
      startDate: body.start_date,
      endDate: body.end_date,
      days: body.days,
      reason: body.reason,
    });

    return res.status(201).json({ data: request });
  } catch (err) {
    return next(err);
  }
}

export function updateStatus(req, res, next) {
  try {
    const id = req.params.id;
    const { status, rejection_reason } = req.body || {};

    if (!status || !['APPROVED', 'REJECTED', 'PENDING'].includes(status)) {
      throw new AppError(400, 'Valid status (PENDING, APPROVED, REJECTED) is required', 'VALIDATION_FAILED');
    }

    const updated = updateTimeOffStatus({
      id,
      status,
      reviewerId: req.user.id,
      rejectionReason: rejection_reason,
    });

    if (!updated) {
      throw new AppError(404, 'Time off request not found', 'NOT_FOUND');
    }

    return res.json({ data: updated });
  } catch (err) {
    return next(err);
  }
}
