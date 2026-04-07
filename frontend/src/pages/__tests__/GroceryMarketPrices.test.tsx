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

// marketLogos util uses real file paths — mock it so jsdom doesn't need assets
vi.mock('../../utils/marketLogos', () => ({
  getMarketLogo: (market: string) => `/market-logos/${market.toLowerCase()}.png`,
  KNOWN_MARKETS: ['bim', 'a101', 'migros', 'carrefour'],
}));

import { api } from '../../api';
import GroceryMarketPrices from '../GroceryMarketPrices';

const mockResults = [
  {
    id: '1',
    title: 'Domates',
    brand: 'BrandA',
    imageUrl: null,
    cheapest_stores: [
      { market: 'bim', price: 18.5, unitPrice: '18,50 TL/kg' },
      { market: 'a101', price: 20.0, unitPrice: '20,00 TL/kg' },
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

// Empty response for popular product background queries
const emptyResponse = { data: { results: [] } };

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
    // Default: popular product background queries return empty
    vi.mocked(api.get).mockResolvedValue(emptyResponse);
  });

  it('renders welcome screen with hero and product cards when no search', async () => {
    renderComponent();
    // "Piyasa Fiyatları" appears in both header and hero — at least 2 occurrences
    expect(screen.getAllByText('Piyasa Fiyatları').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/anlık fiyat karşılaştırması/)).toBeInTheDocument();
    expect(screen.getByText('Güncel Fiyatlar')).toBeInTheDocument();
    // Popular product names appear in cards
    expect(screen.getByText('Patates')).toBeInTheDocument();
  });

  it('shows skeleton while loading search results', async () => {
    vi.mocked(api.get).mockImplementation((url, config) => {
      // Popular product queries resolve immediately; search query hangs
      if ((config as any)?.params?.q && !['domates','patates','soğan','elma','muz','biber','yumurta','ekmek'].includes((config as any).params.q.toLowerCase())) {
        return new Promise(() => {}); // never resolves (search)
      }
      return Promise.resolve(emptyResponse);
    });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'xyz123' },
    });
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
    // After search, welcome screen is replaced by result cards
    await waitFor(() => {
      expect(screen.getByTestId('result-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('result-card-2')).toBeInTheDocument();
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

  it('expands card on click to show store prices with logos', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await screen.findByTestId('result-card-1');

    // Store prices not visible initially
    expect(screen.queryByAltText('bim')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByTestId('result-card-1'));

    // Logo shown as img with alt matching market name
    expect(screen.getByRole('img', { name: 'bim' })).toBeInTheDocument();
    // Price shown
    expect(screen.getByText('₺18.50')).toBeInTheDocument();
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
      expect(screen.getByTestId('result-card-1')).toBeInTheDocument();
    });
  });

  it('multiple cards can be expanded simultaneously', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await screen.findByTestId('result-card-1');
    await screen.findByTestId('result-card-2');

    // Expand first card (has stores)
    fireEvent.click(screen.getByTestId('result-card-1'));
    expect(screen.getByRole('img', { name: 'bim' })).toBeInTheDocument();

    // Expand second card (no stores — nothing extra added)
    fireEvent.click(screen.getByTestId('result-card-2'));

    // First card's content still visible
    expect(screen.getByRole('img', { name: 'bim' })).toBeInTheDocument();
  });
});
