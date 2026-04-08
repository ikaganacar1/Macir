import {
  Box,
  Button,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api, endpoints } from '../api';
import type { DashboardData } from '../types';

function fmt2(v: string | number | undefined): string {
  if (v == null) return '0.00';
  return parseFloat(String(v)).toFixed(2);
}

function fmt1(v: string | number | undefined): string {
  if (v == null) return '0.0';
  return parseFloat(String(v)).toFixed(1);
}

function trDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]}`;
}

export default function GroceryDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());

  const { data } = useQuery<DashboardData>({
    queryKey: ['grocery-dashboard', range, today],
    queryFn: () =>
      api.get(endpoints.dashboard, { params: { range, date: today } }).then((r) => r.data),
  });

  const chartData = (data?.chart ?? []).map((d) => ({
    date: trDate(d.date),
    sales: parseFloat(String(d.sales)),
  }));

  return (
    <Stack gap={0} style={{ minHeight: '100vh', background: '#f9faf7' }}>
      {/* Sticky header */}
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
        <Group justify='space-between'>
          <Group gap='xs'>
            <Button variant='subtle' color='green' px='xs' onClick={() => navigate('/')}>
              <IconArrowLeft size={20} />
            </Button>
            <Title order={4}>Raporlar</Title>
          </Group>
          <SegmentedControl
            size='xs'
            value={range}
            onChange={(v) => setRange(v as typeof range)}
            color='green'
            data={[
              { label: 'Bugün', value: 'today' },
              { label: 'Hafta', value: 'week' },
              { label: 'Ay', value: 'month' },
            ]}
          />
        </Group>
      </Box>

      <Stack p='md' gap='md'>
        {/* Stat cards */}
        <SimpleGrid cols={2} spacing='sm'>
          <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }} data-testid='stat-sales'>
            <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Satış</Text>
            <Text size='xl' fw={700} c='green'>₺{fmt2(data?.total_sales)}</Text>
          </Paper>
          <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }} data-testid='stat-profit'>
            <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Kâr</Text>
            <Text size='xl' fw={700} c='green'>₺{fmt2(data?.net_profit)}</Text>
          </Paper>
        </SimpleGrid>
        <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }} data-testid='stat-items'>
          <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Satılan Ürün Adedi</Text>
          <Text size='xl' fw={700} c='green'>{data?.items_sold ?? 0}</Text>
        </Paper>

        {/* Chart */}
        <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }} data-testid='chart-section'>
          <Text fw={700} mb='md'>
            {{ today: 'Bugünkü Satış', week: '7 Günlük Satış', month: 'Aylık Satış' }[range]}
          </Text>
          <Box h={320}>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                <XAxis dataKey='date' tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={45} tickFormatter={(v) => `₺${v}`} />
                <Tooltip formatter={(v) => [`₺${Number(v).toFixed(2)}`, 'Satış']} />
                <Bar dataKey='sales' fill='var(--mantine-color-green-5)' radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>

        {/* Best sellers */}
        <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }} data-testid='best-sellers'>
          <Text fw={700} mb='sm'>En Çok Satanlar</Text>
          <Stack gap='xs'>
            {(data?.best_sellers ?? []).map((item, i) => (
              <Group key={item.product_id} justify='space-between'>
                <Group gap='xs'>
                  <Text size='sm' c='dimmed' w={20} ta='center'>{i + 1}</Text>
                  <Text size='sm'>{item.name}</Text>
                </Group>
                <Group gap='xs'>
                  <Text size='sm' fw={600} c='green'>₺{fmt2(item.revenue)}</Text>
                  <Text size='xs' c='dimmed'>{fmt1(item.quantity)} {item.unit}</Text>
                </Group>
              </Group>
            ))}
            {!data?.best_sellers?.length && (
              <Text size='sm' c='dimmed'>Henüz satış yok</Text>
            )}
          </Stack>
        </Paper>

        {/* Low stock — only if there are items */}
        {(data?.low_stock?.length ?? 0) > 0 && (
          <Paper
            withBorder
            p='md'
            style={{ border: '1px solid var(--mantine-color-orange-3)', background: 'var(--mantine-color-orange-0)' }}
            data-testid='low-stock-section'
          >
            <Text fw={700} mb='sm' c='orange'>⚠️ Stok Azalanlar ({data?.low_stock?.length})</Text>
            <Stack gap='xs'>
              {(data?.low_stock ?? []).map((item) => (
                <Group key={item.product_id} justify='space-between'>
                  <Text size='sm'>{item.name}</Text>
                  <Text size='sm' c='orange' fw={600}>
                    {fmt1(item.stock_level)} {item.unit}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Stack>
  );
}
