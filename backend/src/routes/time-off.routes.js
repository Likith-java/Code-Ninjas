import { Router } from 'express';
import {
  listTimeOff,
  submitTimeOff,
  updateStatus,
} from '../controllers/time-off.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { requirePasswordChange } from '../middleware/requirePasswordChange.js';

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChange);

router.get('/', listTimeOff);
router.post('/', submitTimeOff);
router.patch('/:id/status', requireRole('admin', 'hr'), updateStatus);
router.post('/:id/approve', requireRole('admin', 'hr'), (req, res, next) => {
  req.body = { status: 'APPROVED' };
  return updateStatus(req, res, next);
});
router.post('/:id/reject', requireRole('admin', 'hr'), (req, res, next) => {
  req.body = { status: 'REJECTED', rejection_reason: req.body?.rejection_reason };
  return updateStatus(req, res, next);
});

export default router;
