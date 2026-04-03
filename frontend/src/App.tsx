import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { MantineProvider } from '@mantine/core';
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

const qc = new QueryClient();

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
      <MantineProvider>
        <Notifications position='top-center' />
        {!authed ? (
          <Login onLogin={() => setAuthed(true)} />
        ) : (
          <Suspense fallback={null}>
            <Routes>
              <Route path='/' element={<GroceryMain />} />
              <Route path='/dashboard' element={<GroceryDashboard />} />
              <Route path='/products' element={<GroceryProducts />} />
              <Route path='/stock/new' element={<GroceryAddStock />} />
              <Route path='/sales/new' element={<GroceryRecordSales />} />
            </Routes>
          </Suspense>
        )}
      </MantineProvider>
    </QueryClientProvider>
  );
}
