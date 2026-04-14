import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import EmptyState from '../EmptyState';

function FakeIcon({ size, color }: { size: number; color: string }) {
  return <div data-testid='empty-icon' style={{ width: size, color }} />;
}

function wrap(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('EmptyState', () => {
  it('renders icon, title, and subtitle', () => {
    wrap(
      <EmptyState icon={FakeIcon} title='No items' subtitle='Add one to get started' />
    );
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Add one to get started')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    wrap(
      <EmptyState icon={FakeIcon} title='T' action={<button>Do it</button>} />
    );
    expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument();
  });

  it('does not render subtitle node when subtitle omitted', () => {
    wrap(<EmptyState icon={FakeIcon} title='T' />);
    expect(screen.queryByText('Add one')).not.toBeInTheDocument();
  });
});
