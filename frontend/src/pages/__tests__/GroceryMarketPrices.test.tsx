import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
  },
  endpoints: {
    marketPrices: '/api/market-prices/search/',
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryMarketPrices from '../GroceryMarketPrices';

const mockResults = [
  {
    id: '1',
    title: 'Domates',
    brand: 'BrandA',
    imageUrl: null,
    cheapest_stores: [
      { market: 'BIM', price: 18.5, unitPrice: '18,50 TL/kg' },
      { market: 'A101', price: 20.0, unitPrice: '20,00 TL/kg' },
    ],
  },
  {
    id: '2',
    title: 'Elma',
    brand: 'BrandB',
    imageUrl: null,
    cheapest_stores: [],
  },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryMarketPrices />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryMarketPrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial helper text when no search submitted', () => {
    renderComponent();
    expect(screen.getByText('Bir ürün adı yazın ve fiyatları karşılaştırın')).toBeInTheDocument();
  });

  it('shows skeleton while loading', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {})); // never resolves
    renderComponent();
    const input = screen.getByPlaceholderText('Ürün adı yazın...');
    fireEvent.change(input, { target: { value: 'domates' } });
    fireEvent.click(screen.getByText('Ara'));
    await waitFor(() => {
      expect(document.querySelector('.mantine-Skeleton-root')).toBeInTheDocument();
    });
  });

  it('renders results after search', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.getByText('Elma')).toBeInTheDocument();
    });
  });

  it('shows "Sonuç bulunamadı" on empty results', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [] } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'xyz' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await waitFor(() => {
      expect(screen.getByText('Sonuç bulunamadı')).toBeInTheDocument();
    });
  });

  it('expands card on click to show store prices', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await screen.findByText('Domates');

    // BIM price not visible initially
    expect(screen.queryByText('BIM')).not.toBeInTheDocument();

    // click to expand
    fireEvent.click(screen.getByTestId('result-card-1'));
    expect(screen.getByText('BIM')).toBeInTheDocument();
    expect(screen.getByText('18.50')).toBeInTheDocument();
  });

  it('back button calls navigate(-1)', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('triggers search on Enter key', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    const input = screen.getByPlaceholderText('Ürün adı yazın...');
    fireEvent.change(input, { target: { value: 'domates' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
  });

  it('multiple cards can be expanded simultaneously', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await screen.findByText('Domates');
    await screen.findByText('Elma');

    // expand first card (Domates - has stores)
    fireEvent.click(screen.getByTestId('result-card-1'));
    expect(screen.getByText('BIM')).toBeInTheDocument();

    // expand second card (Elma - no stores, nothing extra shown)
    fireEvent.click(screen.getByTestId('result-card-2'));

    // first card still shows BIM (both expanded simultaneously)
    expect(screen.getByText('BIM')).toBeInTheDocument();
  });
});
