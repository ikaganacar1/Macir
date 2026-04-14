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
    patch: vi.fn(),
  },
  endpoints: {
    products: '/api/grocery/products/',
    categories: '/api/grocery/categories/',
    marketPrices: '/api/market-prices/search/',
    profile: '/api/grocery/profile/',
  },
}));

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
import GroceryProducts from '../GroceryProducts';

const mockProducts = [
  {
    pk: 1,
    name: 'Domates',
    category: 1,
    category_name: 'Sebze',
    unit: 'kg',
    sell_price: '15.00',
    low_stock_threshold: '2.00',
    expiry_note: '',
    is_active: true,
  },
  {
    pk: 2,
    name: 'Elma',
    category: 2,
    category_name: 'Meyve',
    unit: 'kg',
    sell_price: '25.00',
    low_stock_threshold: '3.00',
    expiry_note: '',
    is_active: true,
  },
  {
    pk: 3,
    name: 'Patlıcan',
    category: 1,
    category_name: 'Sebze',
    unit: 'kg',
    sell_price: '18.00',
    low_stock_threshold: '2.00',
    expiry_note: '',
    is_active: false,
  },
];

const mockCategories = [
  { pk: 1, name: 'Sebze' },
  { pk: 2, name: 'Meyve' },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider env="test">
          <Notifications />
          <GroceryProducts />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryProducts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: { latitude: 41.0082, longitude: 28.9784, search_radius_km: 5 } });
      if (url.includes('categories')) return Promise.resolve({ data: mockCategories });
      return Promise.resolve({ data: mockProducts });
    });
  });

  it('renders Ürünler header with back button', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Ürünler')).toBeInTheDocument();
    });
  });

  it('renders all products', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.getByText('Elma')).toBeInTheDocument();
    });
  });

  it('shows inactive product with (pasif) label', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/Patlıcan/)).toBeInTheDocument();
      expect(screen.getByText(/pasif/)).toBeInTheDocument();
    });
  });

  it('filters products by search term', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
    const search = screen.getByPlaceholderText('Ürün ara...');
    fireEvent.change(search, { target: { value: 'elma' } });
    await waitFor(() => {
      expect(screen.getByText('Elma')).toBeInTheDocument();
      expect(screen.queryByText('Domates')).not.toBeInTheDocument();
    });
  });

  it('opens picker modal when Ürün Ekle is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Ürünler')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
    await waitFor(() => {
      expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument();
    });
  });

  it('opens edit modal with product name when Düzenle clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByRole('button', { name: /^Düzenle$/i });
    fireEvent.click(editButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Ürünü Düzenle')).toBeInTheDocument();
    });
  });

  it('navigates back when back button is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Ürünler')).toBeInTheDocument();
    });
    // The back arrow button
    const backBtn = screen.getAllByRole('button')[0];
    fireEvent.click(backBtn);
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('shows preset picker with emoji cards', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('Ürünler')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
    await waitFor(() => {
      expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument();
      expect(screen.getByText('Salatalık')).toBeInTheDocument();
    });
  });

  it('dims already-added products in the picker', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('Ürünler')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
    await waitFor(() => expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument());
    // 'Domates' exists in mockProducts — its picker card should be dimmed
    const pickerDomates = screen.getAllByText('Domates').find(
      (el) => el.closest('[style*="opacity: 0.35"]') !== null
    );
    expect(pickerDomates).toBeDefined();
  });

  it('opens form pre-filled with preset name when preset tapped', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('Ürünler')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
    await waitFor(() => expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument());
    // 'Salatalık' is not in mockProducts so it is not dimmed
    fireEvent.click(screen.getByText('Salatalık'));
    await waitFor(() => {
      expect(screen.getByText('Yeni Ürün')).toBeInTheDocument();
    });
    // Find the name input by its pre-filled value
    const nameInput = screen.getAllByRole('textbox').find(
      (el) => (el as HTMLInputElement).value === 'Salatalık'
    );
    expect(nameInput).toBeDefined();
  });

  it('opens blank form when Manuel ekle is clicked', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByText('Ürünler')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
    await waitFor(() => expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Manuel ekle →'));
    await waitFor(() => {
      expect(screen.getByText('Yeni Ürün')).toBeInTheDocument();
    });
    // Name input should be blank
    const nameInputs = screen.getAllByRole('textbox').filter(
      (el) => (el as HTMLInputElement).value === ''
    );
    expect(nameInputs.length).toBeGreaterThan(0);
  });

  it('shows cheapest market price indicator on product card', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('profile')) return Promise.resolve({ data: { latitude: 41.0082, longitude: 28.9784, search_radius_km: 5 } });
      if (url.includes('categories')) return Promise.resolve({ data: mockCategories });
      if (url.includes('market-prices')) return Promise.resolve({
        data: {
          results: [
            {
              id: '1',
              title: 'Domates',
              brand: 'BrandX',
              imageUrl: null,
              cheapest_stores: [
                { market: 'BIM', price: 18.5, unitPrice: '18,50 TL/kg' },
              ],
            },
          ],
        },
      });
      return Promise.resolve({ data: mockProducts });
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <MantineProvider>
            <Notifications />
            <GroceryProducts />
          </MantineProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );

    await screen.findByText('Domates');
    await waitFor(() => {
      expect(screen.getByTestId('market-price-1')).toBeInTheDocument();
    });
    // Logo rendered as img inside the indicator — scope to the testid element
    const indicator = screen.getByTestId('market-price-1');
    expect(indicator.querySelector('img[alt="BIM"]')).toBeInTheDocument();
    expect(indicator).toHaveTextContent('18.50');
  });
});
