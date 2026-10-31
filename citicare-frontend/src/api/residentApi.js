import api from './axios';

export const residentApi = {
  getAll: () => api.get('/residents'),
  getMine: () => api.get('/residents/mine'),
  getById: (id) => api.get(`/residents/${id}`),
  create: (data) => api.post('/residents', data),
  update: (id, data) => api.put(`/residents/${id}`, data),
  delete: (id) => api.delete(`/residents/${id}`),
  addMedicalHistory: (id, data) => api.post(`/residents/${id}/medical-history`, data),
};