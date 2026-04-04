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
    stockEntries: '/api/grocery/stock-entries/',
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

import { api } from '../../api';
import GroceryAddStock from '../GroceryAddStock';

const mockProducts = [
  { pk: 1, name: 'Domates', unit: 'kg', stock_level: 5, low_stock_threshold: 3, category_name: 'Sebze' },
  { pk: 2, name: 'Havuç', unit: 'kg', stock_level: 1, low_stock_threshold: 3, category_name: 'Sebze' },
  { pk: 3, name: 'Elma', unit: 'piece', stock_level: 20, low_stock_threshold: 5, category_name: 'Meyve' },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryAddStock />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryAddStock', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: mockProducts });
  });

  it('renders the page header', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Stok Ekle')).toBeInTheDocument();
    });
  });

  it('renders all products from API', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.getByText('Havuç')).toBeInTheDocument();
      expect(screen.getByText('Elma')).toBeInTheDocument();
    });
  });

  it('shows products grouped by category', async () => {
    renderComponent();
    await waitFor(() => {
      // tt='uppercase' is a CSS transform — DOM text remains original case
      expect(screen.getByText('Sebze')).toBeInTheDocument();
      expect(screen.getByText('Meyve')).toBeInTheDocument();
    });
  });

  it('shows orange warning badge for low stock products', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('low-stock-2')).toBeInTheDocument();
    });
  });

  it('save button is disabled when no products have quantity', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
    const saveBtn = screen.getByTestId('save-button');
    expect(saveBtn).toBeDisabled();
  });

  it('opens modal when quantity button is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('qty-btn-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('qty-btn-1'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-btn')).toBeInTheDocument();
    });
  });
});
