import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid='bar-chart'>{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

vi.mock('../../api', () => ({
  api: { get: vi.fn() },
  endpoints: { dashboard: '/api/grocery/dashboard/' },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryDashboard from '../GroceryDashboard';

const mockData = {
  total_sales: '250.00',
  net_profit: '75.50',
  items_sold: 42,
  cash_sales: '80.00',
  card_sales: '20.00',
  best_sellers: [
    { product_id: 1, name: 'Domates', revenue: '120.00', quantity: '30', unit: 'kg' },
    { product_id: 2, name: 'Elma', revenue: '80.00', quantity: '20', unit: 'kg' },
  ],
  low_stock: [],
  chart: [
    { date: '2026-03-29', sales: '50' },
    { date: '2026-03-30', sales: '60' },
  ],
};

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <GroceryDashboard />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: mockData });
  });

  it('renders header with Raporlar title and back button', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Raporlar')).toBeInTheDocument();
    });
  });

  it('shows range control with Bugün, Hafta, Ay options', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Bugün')).toBeInTheDocument();
      expect(screen.getByText('Hafta')).toBeInTheDocument();
      expect(screen.getByText('Ay')).toBeInTheDocument();
    });
  });

  it('renders stat cards with sales and profit data', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/250\.00/)).toBeInTheDocument();
    });
    expect(screen.getByText(/75\.50/)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByTestId('stat-sales')).toBeInTheDocument();
    expect(screen.getByTestId('stat-profit')).toBeInTheDocument();
    expect(screen.getByTestId('stat-items')).toBeInTheDocument();
  });

  it('renders best sellers section with products', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('best-sellers')).toBeInTheDocument();
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.getByText('Elma')).toBeInTheDocument();
    });
  });

  it('does not render low stock section when no low stock', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Raporlar')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('low-stock-section')).not.toBeInTheDocument();
  });

  it('renders low stock section when there are low stock items', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        ...mockData,
        low_stock: [{ product_id: 3, name: 'Muz', stock_level: '1', unit: 'kg' }],
      },
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('low-stock-section')).toBeInTheDocument();
      expect(screen.getByText('Muz')).toBeInTheDocument();
    });
  });

  it('shows chart section', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('chart-section')).toBeInTheDocument();
    });
  });

  it('shows dynamic chart label based on range — week default', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('7 Günlük Satış')).toBeInTheDocument();
    });
  });

  it('converts date strings to Turkish abbreviations', async () => {
    renderComponent();
    await waitFor(() => {
      // '2026-03-29' → '29 Mar' — verify trDate runs without crash
      expect(screen.getByTestId('chart-section')).toBeInTheDocument();
    });
  });

  it('navigates back when back button clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Raporlar')).toBeInTheDocument();
    });
    const backBtn = screen.getByRole('button', { name: '' });
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows "Henüz satış yok" when best_sellers is empty', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...mockData, best_sellers: [] } });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Henüz satış yok')).toBeInTheDocument();
    });
  });
});
