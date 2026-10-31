import api from './axios';

export const medicineApi = {
  // Master list
  getAll: (category) => api.get('/medicines', { params: { category } }),
  create: (data) => api.post('/medicines', data),
  update: (id, data) => api.put(`/medicines/${id}`, data),
  delete: (id) => api.delete(`/medicines/${id}`),
  
  // Resident records
  getResidentMedicines: (residentId) => api.get(`/medicines/resident/${residentId}`),
  recordMedicine: (residentId, data) => api.post(`/medicines/resident/${residentId}`, data),
  deleteRecord: (recordId) => api.delete(`/medicines/record/${recordId}`),
};