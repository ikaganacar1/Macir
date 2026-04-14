import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
    wasteEntries: '/api/grocery/waste-entries/',
  },
}));

import { api } from '../../api';
import GroceryWasteEntry from '../GroceryWasteEntry';

const mockProducts = [
  {
    pk: 1, name: 'Domates', unit: 'kg', sell_price: '18', category: 1,
    category_name: 'Sebze', stock_level: 10, low_stock_threshold: '5',
    is_active: true, svg_icon: null, expiry_note: '', most_recent_purchase_price: '12',
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryWasteEntry />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryWasteEntry', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProducts });
    vi.mocked(api.post).mockResolvedValue({ data: { pk: 1, date: '2026-04-14', notes: '', items: [] } });
  });

  it('renders the page title', async () => {
    renderPage();
    expect(await screen.findByText('Fire/Kayıp Kaydı')).toBeInTheDocument();
  });

  it('shows products list', async () => {
    renderPage();
    expect(await screen.findByText('Domates')).toBeInTheDocument();
  });

  it('save button is not shown when no items selected', async () => {
    renderPage();
    await screen.findByText('Domates');
    expect(screen.queryByRole('button', { name: /kaydet/i })).not.toBeInTheDocument();
  });
});
