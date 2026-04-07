import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';

import { api } from './api';
import Login from './pages/Login';

const GroceryMain = lazy(() => import('./pages/GroceryMain'));
const GroceryDashboard = lazy(() => import('./pages/GroceryDashboard'));
const GroceryProducts = lazy(() => import('./pages/GroceryProducts'));
const GroceryAddStock = lazy(() => import('./pages/GroceryAddStock'));
const GroceryRecordSales = lazy(() => import('./pages/GroceryRecordSales'));
const GrocerySalesHistory = lazy(() => import('./pages/GrocerySalesHistory'));
const GroceryMarketPrices = lazy(() => import('./pages/GroceryMarketPrices'));

const qc = new QueryClient();

const theme = createTheme({
  primaryColor: 'green',
  defaultRadius: 'md',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSizes: { md: '17px' },
  components: {
    Button: {
      defaultProps: { radius: 'md' },
    },
    Paper: {
      defaultProps: { radius: 'md' },
    },
  },
});

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  const checkAuth = () =>
    api.get('/api/auth/status/')
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));

  useEffect(() => { checkAuth(); }, []);

  if (authed === null) return null;

  return (
    <QueryClientProvider client={qc}>
      <MantineProvider theme={theme} defaultColorScheme='light'>
        <Notifications position='top-center' />
        {!authed ? (
          <Login onLogin={() => setAuthed(true)} />
        ) : (
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Yükleniyor...</div>}>
            <Routes>
              <Route path='/' element={<GroceryMain onLogout={() => setAuthed(false)} />} />
              <Route path='/dashboard' element={<GroceryDashboard />} />
              <Route path='/products' element={<GroceryProducts />} />
              <Route path='/stock/new' element={<GroceryAddStock />} />
              <Route path='/sales/new' element={<GroceryRecordSales />} />
              <Route path='/sales/history' element={<GrocerySalesHistory />} />
              <Route path='/market-prices' element={<GroceryMarketPrices />} />
              <Route path='*' element={<div style={{ padding: '2rem', textAlign: 'center' }}>Sayfa bulunamadı.</div>} />
            </Routes>
          </Suspense>
        )}
      </MantineProvider>
    </QueryClientProvider>
  );
}
