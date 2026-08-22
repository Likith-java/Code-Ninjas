import { Router } from 'express';
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  listMeta,
} from '../controllers/employee.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/meta', listMeta);
router.get('/', listEmployees);
router.get('/:id', getEmployee);
router.post('/', requireRole('admin', 'hr'), createEmployee);
router.put('/:id', requireRole('admin', 'hr'), updateEmployee);
router.delete('/:id', requireRole('admin', 'hr'), deleteEmployee);

export default router;
