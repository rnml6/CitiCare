import api from './axios';

export const purokApi = {
  getAll: () => api.get('/puroks'),
  getMine: () => api.get('/puroks/mine'),
  getById: (id) => api.get(`/puroks/${id}`),
  create: (data) => api.post('/puroks', data),
  update: (id, data) => api.put(`/puroks/${id}`, data),
  delete: (id) => api.delete(`/puroks/${id}`),
  setLocation: (id, data) => api.put(`/puroks/${id}/location`, data),
};