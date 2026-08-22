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
} from '../controllers/employee.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requirePasswordChange } from '../middleware/requirePasswordChange.js';

const router = Router();

router.use(requireAuth, requirePasswordChange);

router.get('/meta', listMeta);
router.get('/', listEmployees);
router.post('/', requireRole('admin', 'hr'), createEmployee);
router.get('/:id/resume.pdf', downloadResumePdf);
router.get('/:id/security', requireRole('admin', 'hr'), getSecurity);
router.patch('/:id/status', requireRole('admin', 'hr'), patchAccountStatus);
router.post('/:id/reset-password', requireRole('admin', 'hr'), postResetPassword);
router.get('/:id', getEmployee);
router.put('/:id', patchEmployee);
router.put('/:id/skills', putSkills);
router.put('/:id/certifications', putCertifications);
router.put('/:id/resume', putResume);
router.delete('/:id', requireRole('admin', 'hr'), removeEmployee);

export default router;
