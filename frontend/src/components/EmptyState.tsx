import { Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: React.FC<{ size: number; color: string }>;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <Stack align='center' gap='xs' py='xl'>
      <Icon size={48} color='var(--mantine-color-gray-4)' />
      <Text fw={500}>{title}</Text>
      {subtitle && (
        <Text c='dimmed' size='sm' ta='center'>
          {subtitle}
        </Text>
      )}
      {action}
    </Stack>
  );
}
