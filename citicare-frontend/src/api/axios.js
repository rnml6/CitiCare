// api/axios.js
import axios from 'axios';
import { TOKEN_KEY, clearSessionStorage } from '../utils/session';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// --- Short-lived GET cache -------------------------------------------------
// Switching tabs (Dashboard <-> Residents <-> Purok) used to re-request every
// list from the server even when nothing had changed. Fresh responses are kept
// for a few seconds and replayed from memory; any successful write clears the
// cache so edits never show stale data.
const GET_CACHE_TTL = 15 * 1000;
const getCache = new Map();

const cacheKeyFor = (config) => {
  const params = config.params ? JSON.stringify(config.params) : '';
  return `${config.baseURL || ''}${config.url || ''}?${params}`;
};

const isCacheable = (config) =>
  String(config.method || 'get').toLowerCase() === 'get' &&
  !String(config.url || '').startsWith('/auth');

const clearGetCache = () => getCache.clear();

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Serve a fresh cached GET by swapping in a tiny adapter.
    if (isCacheable(config)) {
      const entry = getCache.get(cacheKeyFor(config));
      if (entry && entry.expiresAt > Date.now()) {
        config.adapter = async () => ({
          data: entry.data,
          status: entry.status,
          statusText: 'OK',
          headers: entry.headers || {},
          config,
          request: {},
        });
      } else if (entry) {
        getCache.delete(cacheKeyFor(config));
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    const method = String(response.config?.method || 'get').toLowerCase();
    if (method === 'get') {
      if (isCacheable(response.config)) {
        getCache.set(cacheKeyFor(response.config), {
          data: response.data,
          status: response.status,
          headers: response.headers,
          expiresAt: Date.now() + GET_CACHE_TTL,
        });
      }
    } else {
      // A write invalidates every cached read.
      clearGetCache();
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      clearSessionStorage();
      clearGetCache();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;