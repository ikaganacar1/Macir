import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  endpoints: {
    products: '/api/grocery/products/',
    dashboard: '/api/grocery/dashboard/',
    saleRecords: '/api/grocery/sale-records/',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

import { api } from '../../api';
import GroceryRecordSales from '../GroceryRecordSales';

const mockProducts = [
  { pk: 1, name: 'Domates', unit: 'kg', sell_price: '10.00', svg_icon: null, category_name: 'Sebze', stock_level: 20 },
  { pk: 2, name: 'Havuç', unit: 'kg', sell_price: '5.00', svg_icon: null, category_name: 'Sebze', stock_level: 1 },
  { pk: 3, name: 'Elma', unit: 'piece', sell_price: '3.00', svg_icon: null, category_name: 'Meyve', stock_level: 15 },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryRecordSales />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryRecordSales', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('dashboard')) return Promise.resolve({ data: { best_sellers: [] } });
      return Promise.resolve({ data: mockProducts });
    });
  });

  it('renders the page header', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Satış Yap')).toBeInTheDocument();
    });
  });

  it('renders product cards from API', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.getByText('Havuç')).toBeInTheDocument();
      expect(screen.getByText('Elma')).toBeInTheDocument();
    });
  });

  it('shows orange low stock dot for products with stock_level <= 2', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Havuç')).toBeInTheDocument();
    });
    expect(screen.getByTestId('low-stock-indicator')).toBeInTheDocument();
  });

  it('shows category chips including Tümü', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Tümü')).toBeInTheDocument();
      expect(screen.getByText('Sebze')).toBeInTheDocument();
      expect(screen.getByText('Meyve')).toBeInTheDocument();
    });
  });

  it('filters products by search', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Ürün ara...');
    fireEvent.change(searchInput, { target: { value: 'domates' } });

    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.queryByText('Elma')).not.toBeInTheDocument();
    });
  });

  it('sticky footer is hidden when no items selected', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Tamamla/)).not.toBeInTheDocument();
  });

  it('shows cash/card toggle', async () => {
    renderComponent();
    expect(await screen.findByText('Satış Yap')).toBeInTheDocument();
    expect(screen.getByText('Nakit')).toBeInTheDocument();
    expect(screen.getByText('Kart')).toBeInTheDocument();
  });
});
