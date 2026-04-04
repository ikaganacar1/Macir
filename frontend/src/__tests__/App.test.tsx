import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../pages/GroceryMain', () => ({
  default: ({ onLogout }: { onLogout: () => void }) => (
    <div>
      <span>GroceryMain</span>
      <button onClick={onLogout}>Çıkış</button>
    </div>
  ),
}));
vi.mock('../pages/GroceryDashboard', () => ({ default: () => <div>GroceryDashboard</div> }));
vi.mock('../pages/GroceryProducts', () => ({ default: () => <div>GroceryProducts</div> }));
vi.mock('../pages/GroceryAddStock', () => ({ default: () => <div>GroceryAddStock</div> }));
vi.mock('../pages/GroceryRecordSales', () => ({ default: () => <div>GroceryRecordSales</div> }));

import { api } from '../api';
import App from '../App';

describe('App', () => {
  it('shows GroceryMain when authenticated', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} });
    render(<MemoryRouter><App /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText('GroceryMain')).toBeInTheDocument();
    });
  });

  it('shows Login when not authenticated', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Unauthorized'));
    render(<MemoryRouter><App /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in|giriş/i })).toBeInTheDocument();
    });
  });
});
