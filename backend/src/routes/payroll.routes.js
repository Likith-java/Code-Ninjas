import { Router } from 'express';
import { generatePayroll } from '../controllers/payroll.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

router.use(requireAuth, requirePermission('payroll:manage'));
router.post('/generate', generatePayroll);

export default router;
