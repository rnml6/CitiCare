// routes/bhwRoutes.js
import express from 'express';
import {
  getAllBHWs,
  getBHWById,
  getMyProfile,
  createBHW,
  updateBHW,
  deleteBHW,
  getBHWSchedules
} from '../controllers/bhwController.js';
import { authenticate, authorizeAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getAllBHWs);
router.get('/me', authenticate, getMyProfile);
router.get('/:id', authenticate, getBHWById);
router.get('/:bhwId/schedules', authenticate, getBHWSchedules);
router.post('/', authenticate, authorizeAdmin, createBHW);
// Workers may update their own contact info (enforced inside the
// controller); all other edits stay admin-only.
router.put('/:id', authenticate, updateBHW);
router.delete('/:id', authenticate, authorizeAdmin, deleteBHW);

export default router;