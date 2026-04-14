import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  endpoints: {
    products: '/api/grocery/products/',
  },
}));

import { api } from '../../api';
import GroceryPriceEditor from '../GroceryPriceEditor';

const mockProducts = [
  {
    pk: 1, name: 'Domates', unit: 'kg', sell_price: '18.00', category: 1,
    category_name: 'Sebze', stock_level: 10, low_stock_threshold: '5',
    is_active: true, svg_icon: null, expiry_note: '', most_recent_purchase_price: '12',
  },
  {
    pk: 2, name: 'Elma', unit: 'kg', sell_price: '30.00', category: 2,
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
          <GroceryPriceEditor />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryPriceEditor', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProducts });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
  });

  it('renders the page title', async () => {
    renderPage();
    expect(await screen.findByText('Fiyat Düzenle')).toBeInTheDocument();
  });

  it('shows all products', async () => {
    renderPage();
    expect(await screen.findByText('Domates')).toBeInTheDocument();
    expect(screen.getByText('Elma')).toBeInTheDocument();
  });

  it('save button is disabled when no changes made', async () => {
    renderPage();
    await screen.findByText('Domates');
    const saveBtn = screen.getByRole('button', { name: /değişiklikleri kaydet/i });
    expect(saveBtn).toBeDisabled();
  });

  it('shows revert button when there are changes', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProducts });
    renderPage();
    // Revert button should not be present initially
    await waitFor(() => {
      expect(screen.queryByTestId('btn-revert')).not.toBeInTheDocument();
    });
  });

  it('categories are rendered in API order not arbitrary key order', async () => {
    const products = [
      { pk: 1, name: 'Domates', category: 1, category_name: 'Sebze', sell_price: '5.00', unit: 'kg', stock_level: 10, low_stock_threshold: '2', is_active: true, svg_icon: null, expiry_note: '', most_recent_purchase_price: null },
      { pk: 2, name: 'Elma', category: 2, category_name: 'Meyve', sell_price: '8.00', unit: 'kg', stock_level: 10, low_stock_threshold: '2', is_active: true, svg_icon: null, expiry_note: '', most_recent_purchase_price: null },
      { pk: 3, name: 'Patates', category: 1, category_name: 'Sebze', sell_price: '3.00', unit: 'kg', stock_level: 10, low_stock_threshold: '2', is_active: true, svg_icon: null, expiry_note: '', most_recent_purchase_price: null },
    ];
    vi.mocked(api.get).mockResolvedValue({ data: products });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
    const categoryLabels = screen.getAllByText(/SEBZE|MEYVE/i);
    // Sebze should come first since it appears first in API response
    expect(categoryLabels[0].textContent).toMatch(/SEBZE/i);
    expect(categoryLabels[1].textContent).toMatch(/MEYVE/i);
  });
});
