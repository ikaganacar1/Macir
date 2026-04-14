import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, it, expect } from 'vitest';
import PageLayout from '../PageLayout';

function wrap(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

describe('PageLayout', () => {
  it('renders header and children', () => {
    wrap(
      <PageLayout header={<div>My Header</div>}>
        <div>Page content</div>
      </PageLayout>
    );
    expect(screen.getByText('My Header')).toBeInTheDocument();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    wrap(
      <PageLayout header={<div>H</div>} footer={<div>Footer bar</div>}>
        <div>Content</div>
      </PageLayout>
    );
    expect(screen.getByText('Footer bar')).toBeInTheDocument();
  });

  it('does not render footer when omitted', () => {
    wrap(
      <PageLayout header={<div>H</div>}>
        <div>Content</div>
      </PageLayout>
    );
    expect(screen.queryByText('Footer bar')).not.toBeInTheDocument();
  });
});
