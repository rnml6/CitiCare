import express from 'express';
import {
  getAllMedicines,
  createMedicine,
  updateMedicine,
  deleteMedicine,
  getResidentMedicines,
  recordResidentMedicine,
  deleteResidentMedicine
} from '../controllers/medicineController.js';
import { authenticate, authorizeAdmin } from '../middleware/auth.js';

const router = express.Router();

// Medicine master list
router.get('/', authenticate, getAllMedicines);
router.post('/', authenticate, authorizeAdmin, createMedicine);
router.put('/:id', authenticate, authorizeAdmin, updateMedicine);
router.delete('/:id', authenticate, authorizeAdmin, deleteMedicine);

// Resident medicine records
router.get('/resident/:residentId', authenticate, getResidentMedicines);
router.post('/resident/:residentId', authenticate, recordResidentMedicine);
router.delete('/record/:recordId', authenticate, deleteResidentMedicine);

export default router;