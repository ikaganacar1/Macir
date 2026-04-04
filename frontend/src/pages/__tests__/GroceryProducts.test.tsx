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
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

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
        <MantineProvider>
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
    vi.mocked(api.get).mockResolvedValue({ data: mockProducts });
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

  it('opens add product modal when Ürün Ekle is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Ürünler')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
    await waitFor(() => {
      expect(screen.getByText('Yeni Ürün')).toBeInTheDocument();
    });
  });

  it('opens edit modal with product name when Düzenle clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
    const editButtons = screen.getAllByRole('button', { name: /Düzenle/i });
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
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
