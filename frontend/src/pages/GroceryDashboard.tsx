import { t } from '../i18n';
import {
  Box,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { api, endpoints } from '../api';

interface DashboardData {
  total_sales: string | number;
  net_profit: string | number;
  items_sold: number;
  best_sellers: { product_id: number; name: string; revenue: string | number; quantity: string | number; unit: string }[];
  low_stock: { product_id: number; name: string; stock_level: string | number; unit: string }[];
  chart: { date: string; sales: string | number }[];
}

function fmt2(v: string | number | undefined): string {
  if (v == null) return '0.00';
  return parseFloat(String(v)).toFixed(2);
}

function fmt1(v: string | number | undefined): string {
  if (v == null) return '0.0';
  return parseFloat(String(v)).toFixed(1);
}

export default function GroceryDashboard() {
  
  const [range, setRange] = useState<'today' | 'week' | 'month'>('today');
  const today = new Date().toISOString().split('T')[0];

  const { data } = useQuery<DashboardData>({
    queryKey: ['grocery-dashboard', range, today],
    queryFn: () =>
      api
        .get(endpoints.dashboard, { params: { range, date: today } })
        .then((r) => r.data),
  });

  const statCards = [
    { label: t`Total Sales`, value: `₺${fmt2(data?.total_sales)}`, color: 'blue' },
    { label: t`Net Profit`, value: `₺${fmt2(data?.net_profit)}`, color: 'green' },
    { label: t`Items Sold`, value: String(data?.items_sold ?? 0), color: 'grape' },
  ];

  return (
    <Stack p='md' gap='md'>
      <Group justify='space-between'>
        <Title order={4}>📊 {t`Dashboard`}</Title>
        <SegmentedControl
          size='xs'
          value={range}
          onChange={(v) => setRange(v as typeof range)}
          data={[
            { label: t`Today`, value: 'today' },
            { label: t`Week`, value: 'week' },
            { label: t`Month`, value: 'month' },
          ]}
        />
      </Group>

      <SimpleGrid cols={3} spacing='sm'>
        {statCards.map((card) => (
          <Paper key={card.label} withBorder p='sm' radius='md'>
            <Text size='xs' c='dimmed' tt='uppercase' fw={600}>{card.label}</Text>
            <Text size='xl' fw={700} c={card.color}>{card.value}</Text>
          </Paper>
        ))}
      </SimpleGrid>

      {/* Best sellers */}
      <Paper withBorder p='sm' radius='md'>
        <Text fw={700} mb='sm'>🏆 {t`Best Selling`}</Text>
        <Stack gap='xs'>
          {(data?.best_sellers ?? []).map((item, i) => (
            <Group key={item.product_id} justify='space-between'>
              <Group gap='xs'>
                <Text size='sm' c='dimmed' w={20}>{i + 1}</Text>
                <Text size='sm'>{item.name}</Text>
              </Group>
              <Group gap='xs'>
                <Text size='sm' fw={600} c='blue'>₺{fmt2(item.revenue)}</Text>
                <Text size='xs' c='dimmed'>{fmt1(item.quantity)} {item.unit}</Text>
              </Group>
            </Group>
          ))}
          {!data?.best_sellers?.length && <Text size='sm' c='dimmed'>{t`No sales yet`}</Text>}
        </Stack>
      </Paper>

      {/* Low stock */}
      {(data?.low_stock?.length ?? 0) > 0 && (
        <Paper withBorder p='sm' radius='md' style={{ borderColor: 'var(--mantine-color-orange-4)' }}>
          <Text fw={700} mb='sm'>⚠️ {t`Low Stock`} ({data?.low_stock?.length})</Text>
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

      {/* 7-day chart */}
      <Paper withBorder p='sm' radius='md'>
        <Text fw={700} mb='sm'>📈 {t`Sales — Last 7 Days`}</Text>
        <Box h={140}>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart data={(data?.chart ?? []).map((d) => ({ ...d, sales: parseFloat(String(d.sales)) }))}>
              <XAxis dataKey='date' tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip formatter={(v) => `₺${Number(v).toFixed(2)}`} />
              <Bar dataKey='sales' fill='var(--mantine-color-blue-5)' radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Paper>
    </Stack>
  );
}
