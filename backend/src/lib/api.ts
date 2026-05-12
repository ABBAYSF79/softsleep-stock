import axios from 'axios';

const api = axios.create({
  baseURL: process.env.API_URL || 'http://localhost:3001/api',
});

api.interceptors.request.use((config) => {
  const token = process.env.API_TOKEN;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
