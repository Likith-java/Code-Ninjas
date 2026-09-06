import { Router } from 'express';
import { getPayrollSummary } from '../controllers/payroll.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const router = Router();

router.use(requireAuth, requirePermission('payroll:manage'));
router.get('/payroll-summary/:period', getPayrollSummary);

export default router;
