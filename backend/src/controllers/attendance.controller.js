import {
  getAttendanceRecords,
  getAttendanceSummary,
  checkIn,
  checkOut,
} from '../services/attendance.service.js';
import { AppError } from '../utils/errors.js';

export function listAttendance(req, res, next) {
  try {
    const isManager = req.user.role === 'admin' || req.user.role === 'hr';
    let employeeId = req.query.employeeId;

    if (!isManager) {
      employeeId = req.user.employee_id;
    }

    const records = getAttendanceRecords({
      employeeId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      month: req.query.month,
    });

    return res.json({ data: records });
  } catch (err) {
    return next(err);
  }
}

export function getSummary(req, res, next) {
  try {
    const isManager = req.user.role === 'admin' || req.user.role === 'hr';
    const requestedEmpId = req.query.employeeId || req.user.employee_id;

    if (!isManager && Number(requestedEmpId) !== Number(req.user.employee_id)) {
      throw new AppError(403, 'Cannot access summary of other employees', 'FORBIDDEN');
    }

    if (!requestedEmpId) {
      throw new AppError(400, 'Employee ID is required for summary', 'VALIDATION_FAILED');
    }

    const summary = getAttendanceSummary({
      employeeId: requestedEmpId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });

    // Return both formatted payload inside data and also root properties for compatibility
    return res.json({
      data: summary,
      ...summary,
    });
  } catch (err) {
    return next(err);
  }
}

export function handleCheckIn(req, res, next) {
  try {
    const body = req.body || {};
    const employeeId = body.employee_id || req.user.employee_id;

    if (!employeeId) {
      throw new AppError(400, 'Employee ID is required for check in', 'VALIDATION_FAILED');
    }

    const record = checkIn({
      employeeId,
      date: body.date,
      time: body.time,
      notes: body.notes,
    });

    return res.status(200).json({ data: record });
  } catch (err) {
    return next(err);
  }
}

export function handleCheckOut(req, res, next) {
  try {
    const body = req.body || {};
    const employeeId = body.employee_id || req.user.employee_id;

    if (!employeeId) {
      throw new AppError(400, 'Employee ID is required for check out', 'VALIDATION_FAILED');
    }

    const record = checkOut({
      employeeId,
      date: body.date,
      time: body.time,
    });

    return res.status(200).json({ data: record });
  } catch (err) {
    return next(err);
  }
}
