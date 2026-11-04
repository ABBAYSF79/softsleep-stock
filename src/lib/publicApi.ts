import axios from 'axios';

// No auth interceptors: public pages must never be redirected to /login.
const publicApi = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? '/api' : 'https://mangesoftsleep.store/api'),
  timeout: 60000,
});

export default publicApi;
