import {
  ActionIcon,
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconChartBar,
  IconClipboardList,
  IconPackage,
  IconSettings,
  IconShoppingBag,
  IconShoppingCart,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { DashboardData, SaleRecord } from '../types';
import { recordTotal, trFullDate } from '../utils/sales';

export default function GroceryMain({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());

  const { data: stats } = useQuery<DashboardData>({
    queryKey: ['grocery-dashboard-today', today],
    queryFn: () =>
      api.get(endpoints.dashboard, { params: { range: 'today', date: today } }).then((r) => r.data),
  });

  const lowStockCount = stats?.low_stock?.length ?? 0;

  const { data: saleRecords, isLoading: salesLoading } = useQuery<SaleRecord[]>({
    queryKey: ['sale-records'],
    queryFn: () => api.get(endpoints.saleRecords).then((r) => r.data),
  });

  const recentSales = saleRecords?.slice(0, 5) ?? [];

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
        <Group gap='xs' align='center'>
          <Text size='sm' c='dimmed'>{todayLabel}</Text>
          <ActionIcon
            variant='subtle'
            color='gray'
            size='md'
            onClick={() => navigate('/profile')}
            data-testid='btn-profile'
          >
            <IconSettings size={18} />
          </ActionIcon>
        </Group>
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

      <Button
        variant='default'
        h={56}
        fullWidth
        leftSection={<IconShoppingBag size={20} />}
        onClick={() => navigate('/market-prices')}
        data-testid='btn-market-prices'
      >
        Piyasa Fiyatları
      </Button>

      {/* Son Satışlar */}
      <Box>
        <Group justify='space-between' mb='xs'>
          <Text fw={600} size='sm'>Son Satışlar</Text>
          <Button
            variant='subtle'
            color='green'
            size='xs'
            p={0}
            data-testid='btn-all-sales'
            onClick={() => navigate('/sales/history')}
          >
            Tümünü Görüntüle →
          </Button>
        </Group>
        {salesLoading ? (
          <Stack gap='xs'>
            {[1, 2, 3].map((i) => <Skeleton key={i} h={36} radius='md' />)}
          </Stack>
        ) : recentSales.length === 0 ? (
          <Text size='sm' c='dimmed' ta='center' py='sm'>Henüz satış yok</Text>
        ) : (
          <Stack gap={4}>
            {recentSales.map((record) => (
              <Group
                key={record.pk}
                justify='space-between'
                px='sm'
                py='xs'
                data-testid={`sale-row-${record.pk}`}
                style={{
                  background: 'white',
                  borderRadius: 'var(--mantine-radius-md)',
                  border: '1px solid #e8f5e9',
                }}
              >
                <Text size='sm' c='dimmed'>{trFullDate(record.date)}</Text>
                <Text size='sm' fw={600} c='green'>₺{recordTotal(record)}</Text>
              </Group>
            ))}
          </Stack>
        )}
      </Box>

      <Box style={{ flex: 1 }} />

      {/* Logout */}
      <Button variant='subtle' color='gray' size='sm' onClick={handleLogout} data-testid="btn-logout">
        Çıkış Yap
      </Button>
    </Stack>
  );
}
