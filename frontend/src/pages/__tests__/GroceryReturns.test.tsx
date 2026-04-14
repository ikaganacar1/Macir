import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  endpoints: {
    products: '/api/grocery/products/',
    returnRecords: '/api/grocery/returns/',
  },
}));

import { api } from '../../api';
import GroceryReturns from '../GroceryReturns';

const mockProducts = [
  {
    pk: 1, name: 'Elma', unit: 'kg', sell_price: '30', category: 1,
    category_name: 'Meyve', stock_level: 5, low_stock_threshold: '3',
    is_active: true, svg_icon: null, expiry_note: '', most_recent_purchase_price: '20',
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryReturns />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryReturns', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProducts });
    vi.mocked(api.post).mockResolvedValue({ data: { pk: 1 } });
  });

  it('renders the page title', async () => {
    renderPage();
    expect(await screen.findByText('İade Al')).toBeInTheDocument();
  });

  it('shows products list', async () => {
    renderPage();
    expect(await screen.findByText('Elma')).toBeInTheDocument();
  });

  it('save button is not shown when no items selected', async () => {
    renderPage();
    await screen.findByText('Elma');
    expect(screen.queryByRole('button', { name: /kaydet/i })).not.toBeInTheDocument();
  });

  it('save confirmation modal is not shown by default', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProducts });
    renderPage();
    await waitFor(() => {
      expect(screen.queryByText('Kayıt onayı')).not.toBeInTheDocument();
    });
  });
});
