import { Router } from 'express';
import {
  listEmployees,
  getEmployee,
  createEmployee,
  patchEmployee,
  removeEmployee,
  patchAccountStatus,
  postResetPassword,
  getSecurity,
  putSkills,
  putCertifications,
  putResume,
  downloadResumePdf,
  listMeta,
  getProfile,
  putProfile,
  postSkill,
  deleteSkill,
  postCertification,
  deleteCertification,
} from '../controllers/employee.controller.js';
import { requireAuth } from '../middleware/auth.js';
import {
  requirePermission,
  requireOwnershipOrPermission,
} from '../middleware/permissions.js';
import { requirePasswordChange } from '../middleware/requirePasswordChange.js';

const router = Router();

// Authenticate and resolve the caller's role (server-side, from the database)
// on every request before any authorization decision is made.
router.use(requireAuth, requirePasswordChange);

// Directory -----------------------------------------------------------------
router.get('/meta', requirePermission('employee:directory:read'), listMeta);
router.get('/', requirePermission('employee:directory:read'), listEmployees);

// Administrative management ---------------------------------------------------
router.post('/', requirePermission('employee:create'), createEmployee);
router.get('/:id/security', requirePermission('account:security:read'), getSecurity);
router.patch('/:id/status', requirePermission('account:status:manage'), patchAccountStatus);
router.post(
  '/:id/reset-password',
  requirePermission('account:password:reset'),
  postResetPassword
);
router.delete('/:id', requirePermission('employee:delete'), removeEmployee);

// Profiles --------------------------------------------------------------------
// Viewing a profile is allowed for every authenticated role; the response is
// narrowed to a read-only public view unless the viewer owns the record or
// holds the manager permission set.
router.get('/:id', requirePermission('employee:profile:read'), getEmployee);

// PRD Employee Profile API ------------------------------------------------------
// GET is viewer-aware by design: the service serializes a dedicated DTO per
// relation (own / other-employee / admin). Sensitive fields never enter the
// response unless the caller is authorized — there is no reliance on the
// client to hide anything.
router.get('/:id/profile', requirePermission('employee:profile:read'), getProfile);

// Mutations: record owner (personal fields only) or managers holding
// "update any". Field whitelists are re-enforced in the service layer, so
// route-guard bypasses still cannot touch protected data.
router.put('/:id/profile', requireOwnershipOrPermission('employee:update:any'), putProfile);

router.post(
  '/:id/skills',
  requireOwnershipOrPermission('employee:content:manage:any'),
  postSkill
);
router.delete(
  '/:id/skills/:skillId',
  requireOwnershipOrPermission('employee:content:manage:any'),
  deleteSkill
);
router.post(
  '/:id/certifications',
  requireOwnershipOrPermission('employee:content:manage:any'),
  postCertification
);
router.delete(
  '/:id/certifications/:certificationId',
  requireOwnershipOrPermission('employee:content:manage:any'),
  deleteCertification
);

// Mutations are limited to the record owner or managers holding the
// "update any" permission. Self-service edits remain restricted to the
// whitelisted fields enforced by the service layer.
router.put('/:id', requireOwnershipOrPermission('employee:update:any'), patchEmployee);
router.put(
  '/:id/skills',
  requireOwnershipOrPermission('employee:content:manage:any'),
  putSkills
);
router.put(
  '/:id/certifications',
  requireOwnershipOrPermission('employee:content:manage:any'),
  putCertifications
);
router.put(
  '/:id/resume',
  requireOwnershipOrPermission('employee:content:manage:any'),
  putResume
);
router.get(
  '/:id/resume.pdf',
  requireOwnershipOrPermission('resume:read:any'),
  downloadResumePdf
);

export default router;
