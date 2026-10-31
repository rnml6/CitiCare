// api/authApi.js
import api from './axios';

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  registerAdmin: (userData) => api.post('/auth/register-admin', userData),
  verifyToken: () => api.get('/auth/verify'),
  getAllUsers: () => api.get('/auth/users'),
  changePassword: (data) => api.put('/auth/change-password', data),
};