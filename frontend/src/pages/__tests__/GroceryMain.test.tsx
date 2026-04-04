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
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryMain from '../GroceryMain';

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
    vi.mocked(api.get).mockResolvedValue({ data: mockStats });
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
    vi.mocked(api.get).mockResolvedValue({ data: mockStatsWithLowStock });
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
});
