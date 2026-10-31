import express from 'express';
import {
  getAllPuroks,
  getMyPurok,
  getPurokById,
  createPurok,
  updatePurok,
  updatePurokLocation,
  deletePurok
} from '../controllers/purokController.js';
import { authenticate, authorizeAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getAllPuroks);
router.get('/mine', authenticate, getMyPurok);
router.get('/:id', authenticate, getPurokById);
router.post('/', authenticate, authorizeAdmin, createPurok);
router.put('/:id', authenticate, authorizeAdmin, updatePurok);
router.put('/:id/location', authenticate, authorizeAdmin, updatePurokLocation);
router.delete('/:id', authenticate, authorizeAdmin, deletePurok);

export default router;