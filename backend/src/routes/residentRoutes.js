import express from 'express';
import {
  getAllResidents,
  getMyResidents,
  getResidentById,
  createResident,
  updateResident,
  deleteResident,
  addMedicalHistory
} from '../controllers/residentController.js';
import { recalculateAllRisks } from '../utils/recalculateRisk.js';
import { authenticate, authorizeAdmin, scopeForWorker } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate, scopeForWorker);

router.get('/', getAllResidents);
router.get('/mine', getMyResidents);
router.get('/:id', getResidentById);
router.post('/', createResident);
router.put('/:id', updateResident);
router.delete('/:id', deleteResident);
router.post('/:id/medical-history', addMedicalHistory);

// One-time migration: recalculate and persist risk scores for all residents
router.post('/recalculate-all-risks', authorizeAdmin, async (req, res) => {
  try {
    const count = await recalculateAllRisks();
    res.json({ success: true, message: `Recalculated risk scores for ${count} residents` });
  } catch (error) {
    console.error('Error recalculating all risks:', error);
    res.status(500).json({ success: false, message: 'Failed to recalculate risks' });
  }
});

export default router;
