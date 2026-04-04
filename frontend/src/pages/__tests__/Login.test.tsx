import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Login from '../Login';

// Mock the api module
vi.mock('../../api', () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
  },
}));

describe('Login', () => {
  it('renders the login form', () => {
    render(
      <MantineProvider>
        <Login onLogin={vi.fn()} />
      </MantineProvider>
    );
    expect(screen.getByLabelText(/kullanıcı adı|username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/şifre|password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /giriş|sign in/i })).toBeInTheDocument();
  });
});
