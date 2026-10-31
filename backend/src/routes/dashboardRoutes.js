// routes/dashboardRoutes.js
import express from 'express';
import {
  getDashboardStats,
  getRiskDistribution,
  getRiskDistributionByPurok,
  getCommonDiseases,
  getMonthlyTrends,
  getTodayActivities,
  getUpcomingActivities,
  getMissedConsultations,
  getNotifications,
  getVulnerableGroupsReport,
  getPrenatalReport,
  getPostpartumReport,
  getInfantsVaccinationReport,
  getSeniorCitizensReport,
  getGeneralHealthReport,
  getAIRecommendation,
  getBhwHome,
  getBhwInterventions
} from '../controllers/dashboardController.js';
import { authenticate, forbidBHWWorker } from '../middleware/auth.js';
import { scopeForWorker } from '../middleware/auth.js';

const router = express.Router();

router.get('/bhw-home', authenticate, scopeForWorker, getBhwHome);
router.get('/bhw-interventions', authenticate, scopeForWorker, getBhwInterventions);

router.get('/stats', authenticate, scopeForWorker, getDashboardStats);
router.get('/risk-distribution', authenticate, scopeForWorker, getRiskDistribution);
router.get('/risk-distribution-by-purok', authenticate, scopeForWorker, getRiskDistributionByPurok);
router.get('/common-diseases', authenticate, scopeForWorker, getCommonDiseases);
router.get('/monthly-trends', authenticate, scopeForWorker, getMonthlyTrends);
router.get('/today-activities', authenticate, scopeForWorker, getTodayActivities);
router.get('/upcoming-activities', authenticate, scopeForWorker, getUpcomingActivities);
router.get('/missed-consultations', authenticate, scopeForWorker, getMissedConsultations);
router.get('/notifications', authenticate, scopeForWorker, getNotifications);
router.get('/vulnerable-groups', authenticate, scopeForWorker, getVulnerableGroupsReport);
router.get('/prenatal-report', authenticate, scopeForWorker, getPrenatalReport);
router.get('/postpartum-report', authenticate, scopeForWorker, getPostpartumReport);
router.get('/infants-vaccination-report', authenticate, scopeForWorker, getInfantsVaccinationReport);
router.get('/seniors-report', authenticate, scopeForWorker, getSeniorCitizensReport);
router.get('/general-health-report', authenticate, scopeForWorker, getGeneralHealthReport);
router.get('/ai-recommendation', authenticate, scopeForWorker, getAIRecommendation);

export default router;
