import {
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconChartBar,
  IconClipboardList,
  IconPackage,
  IconShoppingCart,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { DashboardData } from '../types';

export default function GroceryMain({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  const { data: stats } = useQuery<DashboardData>({
    queryKey: ['grocery-dashboard-today', today],
    queryFn: () =>
      api.get(endpoints.dashboard, { params: { range: 'today', date: today } }).then((r) => r.data),
  });

  const lowStockCount = stats?.low_stock?.length ?? 0;

  const handleLogout = async () => {
    try {
      await api.post('/api/auth/logout/');
    } finally {
      onLogout();
    }
  };

  const todayLabel = new Date().toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Stack p='md' gap='md' style={{ minHeight: '100vh', background: '#f9faf7' }}>
      {/* Header */}
      <Group justify='space-between'>
        <Title order={3} c='green'>🌿 Macır</Title>
        <Text size='sm' c='dimmed'>{todayLabel}</Text>
      </Group>

      {/* Today's stats — tappable, navigate to dashboard */}
      <SimpleGrid cols={2} spacing='sm'>
        <Paper
          withBorder
          p='md'
          style={{ border: '1px solid #e8f5e9', cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
          data-testid="stat-sales"
        >
          <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Bugün Satış</Text>
          <Text size='xl' fw={700} c='green'>
            ₺{stats ? parseFloat(String(stats.total_sales)).toFixed(2) : '0.00'}
          </Text>
        </Paper>
        <Paper
          withBorder
          p='md'
          style={{ border: '1px solid #e8f5e9', cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
          data-testid="stat-profit"
        >
          <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Kâr</Text>
          <Text size='xl' fw={700} c='green'>
            ₺{stats ? parseFloat(String(stats.net_profit)).toFixed(2) : '0.00'}
          </Text>
        </Paper>
      </SimpleGrid>

      {/* Low stock alert — only if low_stock > 0, taps to Stok Ekle */}
      {lowStockCount > 0 && (
        <Box
          p='sm'
          style={{
            background: 'var(--mantine-color-orange-0)',
            border: '1px solid var(--mantine-color-orange-3)',
            borderRadius: 'var(--mantine-radius-md)',
            cursor: 'pointer',
          }}
          onClick={() => navigate('/stock/new')}
          data-testid="low-stock-alert"
        >
          <Group gap='xs'>
            <IconAlertTriangle size={18} color='var(--mantine-color-orange-6)' />
            <Text size='sm' fw={600} c='orange'>
              {lowStockCount} üründe stok azaldı — Stok Ekle
            </Text>
          </Group>
        </Box>
      )}

      {/* Primary action — Satış Yap */}
      <Button
        color='green'
        size='xl'
        h={70}
        leftSection={<IconShoppingCart size={26} />}
        onClick={() => navigate('/sales/new')}
        data-testid="btn-sales"
      >
        <Text size='lg' fw={700}>Satış Yap</Text>
      </Button>

      {/* Secondary action — Stok Ekle */}
      <Button
        variant='light'
        color='green'
        size='lg'
        h={56}
        leftSection={<IconPackage size={22} />}
        onClick={() => navigate('/stock/new')}
        data-testid="btn-stock"
      >
        Stok Ekle
      </Button>

      {/* Tertiary actions */}
      <SimpleGrid cols={2} spacing='sm'>
        <Button
          variant='default'
          h={56}
          leftSection={<IconClipboardList size={20} />}
          onClick={() => navigate('/products')}
          data-testid="btn-products"
        >
          Ürünler
        </Button>
        <Button
          variant='default'
          h={56}
          leftSection={<IconChartBar size={20} />}
          onClick={() => navigate('/dashboard')}
          data-testid="btn-reports"
        >
          Raporlar
        </Button>
      </SimpleGrid>

      <Box style={{ flex: 1 }} />

      {/* Logout */}
      <Button variant='subtle' color='gray' size='sm' onClick={handleLogout} data-testid="btn-logout">
        Çıkış Yap
      </Button>
    </Stack>
  );
}
