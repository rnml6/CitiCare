import api from './axios';

export const scheduleApi = {
  getAll: (params) => api.get('/schedules', { params }),
  getMine: () => api.get('/schedules/mine'),
  getById: (id) => api.get(`/schedules/${id}`),
  getByBHW: (bhwId) => api.get(`/schedules/bhw/${bhwId}`),
  create: (data) => api.post('/schedules', data),
  update: (id, data) => api.put(`/schedules/${id}`, data),
  delete: (id) => api.delete(`/schedules/${id}`),
  
  // Participants
  addParticipant: (scheduleId, data) => api.post(`/schedules/${scheduleId}/participants`, data),
  removeParticipant: (scheduleId, residentId) => api.delete(`/schedules/${scheduleId}/participants/${residentId}`),
  updateParticipant: (scheduleId, residentId, data) => api.put(`/schedules/${scheduleId}/participants/${residentId}`, data),
  getParticipants: (scheduleId) => api.get(`/schedules/${scheduleId}/participants`),
  getProgramStats: (scheduleId) => api.get(`/schedules/${scheduleId}/stats`),
};