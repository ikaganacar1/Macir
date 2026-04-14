import { Box, Stack } from '@mantine/core';
import type { ReactNode } from 'react';

interface PageLayoutProps {
  header: ReactNode;
  footer?: ReactNode;
  /** Extra bottom padding for content when footer is present. Defaults to 100. */
  footerPadding?: number;
  children: ReactNode;
}

export default function PageLayout({
  header,
  footer,
  footerPadding = 100,
  children,
}: PageLayoutProps) {
  return (
    <Stack gap={0} style={{ minHeight: '100vh', background: '#f9faf7' }}>
      <Box
        p='md'
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#f9faf7',
          borderBottom: '1px solid #e8f5e9',
        }}
      >
        {header}
      </Box>
      <Stack
        p='md'
        gap='md'
        style={{ paddingBottom: footer ? footerPadding : undefined }}
      >
        {children}
      </Stack>
      {footer && (
        <Box
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 20,
          }}
        >
          {footer}
        </Box>
      )}
    </Stack>
  );
}
