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
    products: '/api/grocery/products/',
    profile: '/api/grocery/profile/',
  },
}));

const mockProfile = { latitude: 41.0082, longitude: 28.9784, search_radius_km: 5 };

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

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

const mockProducts = [
  { pk: 1, name: 'Domates', category: 1, category_name: 'Sebze', unit: 'kg', sell_price: '15.00', is_active: true, stock_level: 5, most_recent_purchase_price: null, low_stock_threshold: '2.00', expiry_note: '', svg_icon: null },
  { pk: 2, name: 'Patates', category: 1, category_name: 'Sebze', unit: 'kg', sell_price: '12.00', is_active: true, stock_level: 3, most_recent_purchase_price: null, low_stock_threshold: '2.00', expiry_note: '', svg_icon: null },
];

const emptyResponse = { data: { results: [] } };
const emptyProducts = { data: [] };

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
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: mockProfile });
      if (url.includes('products')) return Promise.resolve(emptyProducts);
      return Promise.resolve(emptyResponse);
    });
  });

  it('shows default greengrocery products when user has no products', async () => {
    renderComponent();
    expect(screen.getByText('Güncel Fiyatlar')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.getByText('Patates')).toBeInTheDocument();
      expect(screen.getByText('Salatalık')).toBeInTheDocument();
    });
  });

  it('shows user products when they have products in Ürünler', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: mockProfile });
      if (url.includes('products')) return Promise.resolve({ data: mockProducts });
      return Promise.resolve(emptyResponse);
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Ürünlerinizin Piyasa Fiyatları')).toBeInTheDocument();
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.getByText('Patates')).toBeInTheDocument();
    });
  });

  it('shows skeleton while loading search results', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: mockProfile });
      if (url.includes('products')) return Promise.resolve(emptyProducts);
      if (url.includes('market-prices') && url.includes('xyz123')) {
        return new Promise(() => {}); // never resolves
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
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: mockProfile });
      if (url.includes('products')) return Promise.resolve(emptyProducts);
      return Promise.resolve({ data: { results: mockResults } });
    });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await waitFor(() => {
      expect(screen.getByTestId('result-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('result-card-2')).toBeInTheDocument();
    });
  });

  it('shows "Sonuç bulunamadı" on empty results', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: mockProfile });
      if (url.includes('products')) return Promise.resolve(emptyProducts);
      return Promise.resolve({ data: { results: [] } });
    });
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
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: mockProfile });
      if (url.includes('products')) return Promise.resolve(emptyProducts);
      return Promise.resolve({ data: { results: mockResults } });
    });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await screen.findByTestId('result-card-1');

    expect(screen.queryByText('₺18.50')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('result-card-1'));
    expect(screen.getByRole('img', { name: 'bim' })).toBeInTheDocument();
    expect(screen.getByText('₺18.50')).toBeInTheDocument();
  });

  it('back button calls navigate(-1)', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('triggers search on Enter key', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: mockProfile });
      if (url.includes('products')) return Promise.resolve(emptyProducts);
      return Promise.resolve({ data: { results: mockResults } });
    });
    renderComponent();
    const input = screen.getByPlaceholderText('Ürün adı yazın...');
    fireEvent.change(input, { target: { value: 'domates' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => {
      expect(screen.getByTestId('result-card-1')).toBeInTheDocument();
    });
  });

  it('multiple cards can be expanded simultaneously', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: mockProfile });
      if (url.includes('products')) return Promise.resolve(emptyProducts);
      return Promise.resolve({ data: { results: mockResults } });
    });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await screen.findByTestId('result-card-1');
    await screen.findByTestId('result-card-2');

    fireEvent.click(screen.getByTestId('result-card-1'));
    expect(screen.getByRole('img', { name: 'bim' })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('result-card-2'));
    expect(screen.getByRole('img', { name: 'bim' })).toBeInTheDocument();
  });
});
