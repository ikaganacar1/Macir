import axios from 'axios';

function getCsrf(): string {
  return document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';
}

export const api = axios.create({ withCredentials: true });

api.interceptors.request.use((config) => {
  config.headers['X-CSRFToken'] = getCsrf();
  return config;
});

export const endpoints = {
  categories:   '/api/grocery/categories/',
  products:     '/api/grocery/products/',
  stockEntries: '/api/grocery/stock-entries/',
  saleRecords:  '/api/grocery/sale-records/',
  dashboard:    '/api/grocery/dashboard/',
  marketPrices: '/api/market-prices/search/',
  profile:      '/api/grocery/profile/',
};
