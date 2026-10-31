// api/bhwApi.js
import api from './axios';

export const bhwApi = {
  getAll: (params) => api.get('/bhws', { params }),
  getMe: () => api.get('/bhws/me'),
  getById: (id) => api.get(`/bhws/${id}`),
  create: (data) => api.post('/bhws', data),
  update: (id, data) => api.put(`/bhws/${id}`, data),
  delete: (id) => api.delete(`/bhws/${id}`),
  getSchedules: (bhwId) => api.get(`/bhws/${bhwId}/schedules`),
  getByType: (workerType) => api.get('/bhws', { params: { workerType } }),
};