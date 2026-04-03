// src/frontend/src/components/grocery/NumpadInput.tsx
import { Button, Group, Stack, Text } from '@mantine/core';

interface NumpadInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Mobile numpad for entering decimal quantities.
 * Avoids the native keyboard popup on mobile devices.
 */
export function NumpadInput({ value, onChange }: NumpadInputProps) {
  const handleKey = (key: string) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1) || '0');
      return;
    }
    if (key === '.' && value.includes('.')) return;
    if (value === '0' && key !== '.') {
      onChange(key);
      return;
    }
    // Limit to 3 decimal places
    const [, decimals] = value.split('.');
    if (decimals !== undefined && decimals.length >= 3) return;
    onChange(value + key);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

  return (
    <Stack gap='xs'>
      <Text
        ta='center'
        size='xl'
        fw={700}
        style={{
          fontSize: 36,
          background: 'var(--mantine-color-gray-0)',
          border: '2px solid var(--mantine-color-green-6)',
          borderRadius: 8,
          padding: '8px 12px',
        }}
      >
        {value}
      </Text>
      <Group gap='xs' style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        {keys.map((key) => (
          <Button
            key={key}
            variant={key === '⌫' ? 'filled' : 'default'}
            color={key === '⌫' ? 'red' : undefined}
            size='lg'
            onClick={() => handleKey(key)}
            style={{ fontSize: 18 }}
          >
            {key}
          </Button>
        ))}
      </Group>
    </Stack>
  );
}
