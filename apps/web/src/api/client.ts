import axios from 'axios';
import { supabase } from './supabase';
import { transformResponse } from './transforms';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export const apiClient = axios.create({ baseURL: API_BASE });

apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => transformResponse(res.data) as typeof res,
  (err) => Promise.reject(err.response?.data ?? err),
);
