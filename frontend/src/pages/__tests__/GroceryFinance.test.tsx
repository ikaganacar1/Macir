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
    delete: vi.fn(),
  },
  endpoints: {
    finance: '/api/grocery/finance/',
    debts: '/api/grocery/debts/',
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryFinance from '../GroceryFinance';

const mockEntries = [
  {
    pk: 1,
    category: 'Kira',
    entry_type: 'expense',
    amount: '5000.00',
    date: '2026-04-01',
    is_recurring: true,
    notes: '',
  },
  {
    pk: 2,
    category: 'Bonus',
    entry_type: 'income',
    amount: '500.00',
    date: '2026-04-05',
    is_recurring: false,
    notes: '',
  },
];

const mockDebts = [
  {
    pk: 1,
    name: 'Banka Kredisi',
    total_amount: '50000.00',
    monthly_payment: '2000.00',
    start_date: '2026-01-01',
    is_active: true,
    remaining_amount: '44000.00',
    notes: '',
  },
];

const mockPayments = [
  { pk: 1, debt: 1, amount: '2000.00', date: '2026-02-01', notes: '' },
  { pk: 2, debt: 1, amount: '2000.00', date: '2026-03-01', notes: '' },
  { pk: 3, debt: 1, amount: '2000.00', date: '2026-04-01', notes: '' },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryFinance />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryFinance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (String(url).includes('debts') && String(url).includes('payments')) {
        return Promise.resolve({ data: mockPayments });
      }
      if (String(url).includes('debts')) return Promise.resolve({ data: mockDebts });
      return Promise.resolve({ data: mockEntries });
    });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.delete).mockResolvedValue({});
  });

  it('renders header with Borçlar & Giderler title', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Borçlar & Giderler')).toBeInTheDocument();
    });
  });

  it('shows Giderler / Gelirler and Borçlar tabs', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('tab-entries')).toBeInTheDocument();
      expect(screen.getByTestId('tab-debts')).toBeInTheDocument();
    });
  });

  it('renders finance entries in Giderler tab', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('entry-row-1')).toBeInTheDocument();
      expect(screen.getByText('Kira')).toBeInTheDocument();
      expect(screen.getByText('₺5000.00')).toBeInTheDocument();
    });
  });

  it('shows Aylık badge for recurring entry', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Aylık')).toBeInTheDocument();
    });
  });

  it('shows Gelir badge for income entry', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Gelir')).toBeInTheDocument();
    });
  });

  it('opens add entry modal when Ekle is clicked', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('btn-add-entry')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-entry'));
    await waitFor(() => {
      expect(screen.getByText('Kayıt Ekle')).toBeInTheDocument();
    });
  });

  it('submits new entry when form is filled and saved', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('btn-add-entry')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-entry'));
    await waitFor(() => expect(screen.getByTestId('input-entry-category')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('input-entry-category'), {
      target: { value: 'Elektrik' },
    });
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByTestId('btn-save-entry'));
    await waitFor(() => {
      expect(vi.mocked(api.post)).toHaveBeenCalledWith(
        '/api/grocery/finance/',
        expect.objectContaining({ category: 'Elektrik', entry_type: 'expense' })
      );
    });
  });

  it('navigates back when back button clicked', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('btn-back')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('decrements month when prev-month clicked', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('month-label')).toBeInTheDocument());
    const labelBefore = screen.getByTestId('month-label').textContent;
    fireEvent.click(screen.getByTestId('btn-prev-month'));
    await waitFor(() => {
      expect(screen.getByTestId('month-label').textContent).not.toBe(labelBefore);
    });
  });

  it('switches to Borçlar tab and shows debt card', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('tab-debts')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('tab-debts'));
    await waitFor(() => {
      expect(screen.getByTestId('debt-card-1')).toBeInTheDocument();
      expect(screen.getByText('Banka Kredisi')).toBeInTheDocument();
    });
  });

  it('shows remaining amount on debt card', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => {
      expect(screen.getByText(/44000\.00.*50000\.00 kaldı/)).toBeInTheDocument();
    });
  });

  it('progress bar is rendered for debt', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => {
      expect(screen.getByTestId('debt-progress-1')).toBeInTheDocument();
    });
  });

  it('expands debt to show payments panel', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => expect(screen.getByTestId('debt-card-1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Banka Kredisi'));
    await waitFor(() => {
      expect(screen.getByTestId('debt-payments-1')).toBeInTheDocument();
    });
  });

  it('opens add payment modal pre-filled with monthly payment', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => expect(screen.getByTestId('debt-card-1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Banka Kredisi'));
    await waitFor(() => expect(screen.getByTestId('btn-add-payment-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-payment-1'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Ödeme Ekle' })).toBeInTheDocument();
      expect(screen.getByText('2000.00')).toBeInTheDocument();
    });
  });

  it('opens add debt modal', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => expect(screen.getByTestId('btn-add-debt')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-debt'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Borç Ekle' })).toBeInTheDocument();
      expect(screen.getByTestId('input-debt-name')).toBeInTheDocument();
    });
  });

  it('delete entry button opens confirmation modal', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (String(url).includes('debts')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: mockEntries });
    });
    renderComponent();
    const deleteBtn = await screen.findByTestId('btn-delete-entry-1');
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(screen.getByText('Emin misiniz?')).toBeInTheDocument();
      expect(screen.getByText('Bu kayıt kalıcı olarak silinecek.')).toBeInTheDocument();
    });
  });

  it('confirming delete calls api.delete', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (String(url).includes('debts')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: mockEntries });
    });
    vi.mocked(api.delete).mockResolvedValue({});
    renderComponent();
    const deleteBtn = await screen.findByTestId('btn-delete-entry-1');
    fireEvent.click(deleteBtn);
    const confirmBtn = await screen.findByTestId('btn-confirm-delete');
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/api/grocery/finance/1/');
    });
  });

  it('prev month button uses left chevron icon', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderComponent();
    const prevBtn = await screen.findByTestId('btn-prev-month');
    // IconChevronLeft renders as an SVG — verify the rotate transform is gone
    const svg = prevBtn.querySelector('svg');
    expect(svg).not.toHaveStyle('transform: rotate(-90deg)');
  });
});
