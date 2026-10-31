// routes/scheduleRoutes.js
import express from 'express';
import {
  getAllSchedules,
  getMySchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getSchedulesByBHW,
  addParticipant,
  removeParticipant,
  updateParticipant,
  getParticipants,
  getProgramStats
} from '../controllers/scheduleController.js';
import { authenticate, scopeForWorker } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate, scopeForWorker);

router.get('/', getAllSchedules);
router.get('/mine', getMySchedules);
router.get('/bhw/:bhwId', getSchedulesByBHW);
router.get('/:id', getScheduleById);
router.post('/', createSchedule);
router.put('/:id', updateSchedule);
router.delete('/:id', deleteSchedule);

router.get('/:scheduleId/participants', getParticipants);
router.post('/:scheduleId/participants', addParticipant);
router.put('/:scheduleId/participants/:residentId', updateParticipant);
router.delete('/:scheduleId/participants/:residentId', removeParticipant);

router.get('/:scheduleId/stats', getProgramStats);

export default router;
