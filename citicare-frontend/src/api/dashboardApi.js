// api/dashboardApi.js
import api from './axios';

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getRiskDistribution: () => api.get('/dashboard/risk-distribution'),
  getRiskDistributionByPurok: () => api.get('/dashboard/risk-distribution-by-purok'),
  getCommonDiseases: (purokId) => api.get('/dashboard/common-diseases', { params: { purokId } }),
  getMonthlyTrends: (year) => api.get('/dashboard/monthly-trends', { params: { year } }),
  getTodayActivities: () => api.get('/dashboard/today-activities'),
  getUpcomingActivities: () => api.get('/dashboard/upcoming-activities'),
  getMissedConsultations: () => api.get('/dashboard/missed-consultations'),
  getNotifications: () => api.get('/dashboard/notifications'),
  getVulnerableGroupsReport: (group = 'all') => api.get('/dashboard/vulnerable-groups', { params: { group } }),
  getPrenatalReport: () => api.get('/dashboard/prenatal-report'),
  getPostpartumReport: () => api.get('/dashboard/postpartum-report'),
  getInfantsVaccinationReport: () => api.get('/dashboard/infants-vaccination-report'),
  getSeniorCitizensReport: () => api.get('/dashboard/seniors-report'),
  getGeneralHealthReport: () => api.get('/dashboard/general-health-report'),
  getAIRecommendation: (period = 'monthly') => api.get('/dashboard/ai-recommendation', { params: { period } }),
  getBhwHome: () => api.get('/dashboard/bhw-home'),
  getBhwInterventions: () => api.get('/dashboard/bhw-interventions'),
};