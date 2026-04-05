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
    dashboard: '/api/grocery/dashboard/',
    saleRecords: '/api/grocery/sale-records/',
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryMain from '../GroceryMain';

const mockSaleRecords = [
  {
    pk: 1,
    date: '2026-04-05',
    notes: '',
    items: [
      { pk: 1, product: 1, product_name: 'Domates', quantity: '3.000', sell_price: '18.00' },
    ],
  },
  {
    pk: 2,
    date: '2026-04-04',
    notes: '',
    items: [
      { pk: 2, product: 2, product_name: 'Elma', quantity: '2.000', sell_price: '12.00' },
    ],
  },
];

const mockStats = {
  total_sales: 150.50,
  net_profit: 45.00,
  low_stock: [],
};

const mockStatsWithLowStock = {
  ...mockStats,
  low_stock: [{ product_id: 1 }, { product_id: 2 }],
};

function renderComponent(onLogout = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryMain onLogout={onLogout} />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryMain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (String(url).includes('sale-records')) {
        return Promise.resolve({ data: mockSaleRecords });
      }
      return Promise.resolve({ data: mockStats });
    });
    vi.mocked(api.post).mockResolvedValue({});
  });

  it('renders the Macır header and today date', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Macır/)).toBeInTheDocument();
    });
  });

  it('shows sales and profit stat cards', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('stat-sales')).toBeInTheDocument();
      expect(screen.getByTestId('stat-profit')).toBeInTheDocument();
    });
  });

  it('does not show low stock alert when no low stock', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Macır/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('low-stock-alert')).not.toBeInTheDocument();
  });

  it('shows low stock alert when products are low', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (String(url).includes('sale-records')) {
        return Promise.resolve({ data: mockSaleRecords });
      }
      return Promise.resolve({ data: mockStatsWithLowStock });
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('low-stock-alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/2 üründe stok azaldı/)).toBeInTheDocument();
  });

  it('navigates to /sales/new when Satış Yap is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('btn-sales')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-sales'));
    expect(mockNavigate).toHaveBeenCalledWith('/sales/new');
  });

  it('navigates to /stock/new when Stok Ekle is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('btn-stock')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-stock'));
    expect(mockNavigate).toHaveBeenCalledWith('/stock/new');
  });

  it('calls onLogout after logout button click', async () => {
    const onLogout = vi.fn();
    renderComponent(onLogout);
    await waitFor(() => {
      expect(screen.getByTestId('btn-logout')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-logout'));
    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled();
    });
  });

  it('renders Son Satışlar section header', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Son Satışlar')).toBeInTheDocument();
    });
  });

  it('renders Tümünü Görüntüle button that navigates to /sales/history', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('btn-all-sales')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-all-sales'));
    expect(mockNavigate).toHaveBeenCalledWith('/sales/history');
  });

  it('renders recent sale record rows with date and total', async () => {
    renderComponent();
    await waitFor(() => {
      // 3.000 × 18.00 = 54.00
      expect(screen.getByTestId('sale-row-1')).toBeInTheDocument();
      expect(screen.getByText('₺54.00')).toBeInTheDocument();
    });
  });
});
