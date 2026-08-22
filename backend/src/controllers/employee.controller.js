import {
  getEmployeeDetail,
  provisionEmployee,
  updateEmployee,
  deleteEmployee,
  setAccountStatus,
  resetPassword,
  getSecurityInfo,
  updateSkills,
  updateCertifications,
  updateResume,
  getResumePdf,
} from '../services/employee.service.js';
import {
  getEmployeeProfile,
  updateEmployeeProfile,
  addSkill,
  removeSkill,
  addCertification,
  removeCertification,
} from '../services/profile/profile.service.js';
import { listDirectoryCards } from '../services/directory/directory.service.js';
import { DIRECTORY_STATUSES } from '../services/directory/status.service.js';
import { DEPARTMENTS, STATUSES } from '../validators/employee.validator.js';

function listParams(req) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const department =
    typeof req.query.department === 'string' && req.query.department !== 'All'
      ? req.query.department
      : null;
  const status = DIRECTORY_STATUSES.includes(req.query.status) ? req.query.status : null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  return { q, department, status, page, limit };
}

export function listEmployees(req, res, next) {
  try {
    const params = listParams(req);
    const { cards, total } = listDirectoryCards(params);
    return res.json({
      data: cards,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.limit)),
      },
    });
  } catch (err) {
    return next(err);
  }
}

export function getEmployee(req, res, next) {
  try {
    return res.json({ data: getEmployeeDetail(req.user, req.params.id) });
  } catch (err) {
    return next(err);
  }
}

export function createEmployee(req, res, next) {
  try {
    const created = provisionEmployee(req.body || {});
    return res.status(201).json({ data: created });
  } catch (err) {
    return next(err);
  }
}

export function patchEmployee(req, res, next) {
  try {
    const updated = updateEmployee(req.user, req.params.id, req.body || {});
    return res.json({ data: updated });
  } catch (err) {
    return next(err);
  }
}

export function removeEmployee(req, res, next) {
  try {
    return res.json({ data: deleteEmployee(req.params.id) });
  } catch (err) {
    return next(err);
  }
}

export function patchAccountStatus(req, res, next) {
  try {
    return res.json({
      data: setAccountStatus(req.user, req.params.id, req.body?.account_status),
    });
  } catch (err) {
    return next(err);
  }
}

export function postResetPassword(req, res, next) {
  try {
    return res.json({ data: resetPassword(req.user, req.params.id) });
  } catch (err) {
    return next(err);
  }
}

export function getSecurity(req, res, next) {
  try {
    return res.json({ data: getSecurityInfo(req.user, req.params.id) });
  } catch (err) {
    return next(err);
  }
}

export function putSkills(req, res, next) {
  try {
    return res.json({ data: updateSkills(req.user, req.params.id, req.body || {}) });
  } catch (err) {
    return next(err);
  }
}

export function putCertifications(req, res, next) {
  try {
    return res.json({ data: updateCertifications(req.user, req.params.id, req.body || {}) });
  } catch (err) {
    return next(err);
  }
}

export function putResume(req, res, next) {
  try {
    return res.json({ data: updateResume(req.user, req.params.id, req.body || {}) });
  } catch (err) {
    return next(err);
  }
}

export function downloadResumePdf(req, res, next) {
  try {
    const { buffer, fileName } = getResumePdf(req.user, req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

export function listMeta(_req, res) {
  return res.json({
    data: {
      departments: DEPARTMENTS,
      statuses: STATUSES,
      directory_statuses: DIRECTORY_STATUSES,
    },
  });
}

// Profile API (PRD Employee Profile module) -----------------------------------

export function getProfile(req, res, next) {
  try {
    return res.json({ data: getEmployeeProfile(req.user, req.params.id) });
  } catch (err) {
    return next(err);
  }
}

export function putProfile(req, res, next) {
  try {
    return res.json({ data: updateEmployeeProfile(req.user, req.params.id, req.body || {}) });
  } catch (err) {
    return next(err);
  }
}

export function postSkill(req, res, next) {
  try {
    return res.status(201).json({ data: addSkill(req.user, req.params.id, req.body || {}) });
  } catch (err) {
    return next(err);
  }
}

export function deleteSkill(req, res, next) {
  try {
    return res.json({ data: removeSkill(req.user, req.params.id, req.params.skillId) });
  } catch (err) {
    return next(err);
  }
}

export function postCertification(req, res, next) {
  try {
    return res
      .status(201)
      .json({ data: addCertification(req.user, req.params.id, req.body || {}) });
  } catch (err) {
    return next(err);
  }
}

export function deleteCertification(req, res, next) {
  try {
    return res.json({
      data: removeCertification(req.user, req.params.id, req.params.certificationId),
    });
  } catch (err) {
    return next(err);
  }
}
