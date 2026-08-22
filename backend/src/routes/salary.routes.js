import { Router } from 'express';
import {
  getSalaryStructure,
  getSalaryHistory,
  listSalaryStructures,
  updateSalaryStructure,
} from '../controllers/salary.controller.js';

const router = Router();

router.get('/', listSalaryStructures);
router.get('/:employeeId', getSalaryStructure);
router.get('/:employeeId/history', getSalaryHistory);
router.put('/:employeeId', updateSalaryStructure);

export default router;
