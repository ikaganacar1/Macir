import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api', () => ({
  api: { get: vi.fn() },
  endpoints: { saleRecords: '/api/grocery/sale-records/' },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GrocerySalesHistory from '../GrocerySalesHistory';

const TODAY = '2026-04-05';

const mockRecords = [
  {
    pk: 1,
    date: TODAY,
    notes: '',
    items: [
      { pk: 1, product: 1, product_name: 'Domates', quantity: '3.000', sell_price: '18.00' },
    ],
  },
  {
    pk: 2,
    date: '2026-04-01',
    notes: 'test notu',
    items: [
      { pk: 2, product: 2, product_name: 'Elma', quantity: '2.000', sell_price: '12.00' },
    ],
  },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <GrocerySalesHistory />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GrocerySalesHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05'));
    vi.mocked(api.get).mockResolvedValue({ data: mockRecords });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders header with Satış Geçmişi title', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Satış Geçmişi')).toBeInTheDocument();
    });
  });

  it('renders all records by default', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
  });

  it('expands a record on click to show line items', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('sale-card-1'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-items-1')).toBeInTheDocument();
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
  });

  it('collapses an expanded record on second click', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('sale-card-1'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-items-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('sale-card-1'));
    await waitFor(() => {
      expect(screen.queryByTestId('sale-items-1')).not.toBeInTheDocument();
    });
  });

  it('shows notes when record is expanded and notes is non-empty', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('sale-card-2'));
    await waitFor(() => {
      expect(screen.getByText('test notu')).toBeInTheDocument();
    });
  });

  it('filters to today only when Bugün is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Bugün'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
      expect(screen.queryByTestId('sale-card-2')).not.toBeInTheDocument();
    });
  });

  it('filters records by product name search', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Ürün ara...'), {
      target: { value: 'Elma' },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('sale-card-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
  });

  it('shows Sonuç bulunamadı when filters produce no results', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Ürün ara...'), {
      target: { value: 'xyz-nonexistent' },
    });
    await waitFor(() => {
      expect(screen.getByText('Sonuç bulunamadı')).toBeInTheDocument();
    });
  });

  it('shows Henüz satış yok when no records exist', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Henüz satış yok')).toBeInTheDocument();
    });
  });

  it('navigates back when back button is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Satış Geçmişi')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});
