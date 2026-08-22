import { Router } from 'express';
import {
  listAttendance,
  getSummary,
  handleCheckIn,
  handleCheckOut,
} from '../controllers/attendance.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePasswordChange } from '../middleware/requirePasswordChange.js';

const router = Router();

router.use(requireAuth);
router.use(requirePasswordChange);

router.get('/', listAttendance);
router.get('/summary', getSummary);
router.post('/check-in', handleCheckIn);
router.post('/check-out', handleCheckOut);

export default router;
