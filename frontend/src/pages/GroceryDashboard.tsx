import {
  Box,
  Button,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconChartBar,
  IconCircleCheck,
  IconTrendingDown,
  IconTrendingUp,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api, endpoints } from '../api';
import EmptyState from '../components/EmptyState';
import type { DashboardData } from '../types';
import { formatCurrency, formatShortDate, getIstanbulToday } from '../utils/format';

function fmt1(v: string | number | undefined): string {
  if (v == null) return '0.0';
  return parseFloat(String(v)).toFixed(1);
}

function ComparisonBadge({ current, prev }: { current: number; prev: number }) {
  if (prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  const up = pct >= 0;
  return (
    <Group gap={3} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {up ? (
        <IconTrendingUp size={12} color='var(--mantine-color-green-6)' />
      ) : (
        <IconTrendingDown size={12} color='var(--mantine-color-red-6)' />
      )}
      <Text size='xs' c={up ? 'green' : 'red'} fw={600}>
        {up ? '+' : ''}{pct.toFixed(1)}%
      </Text>
    </Group>
  );
}

function StatCard({
  label,
  value,
  sub,
  extra,
  'data-testid': testId,
}: {
  label: string;
  value: string;
  sub?: string;
  extra?: React.ReactNode;
  'data-testid'?: string;
}) {
  return (
    <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }} data-testid={testId}>
      <Text size='xs' c='dimmed' tt='uppercase' fw={600} mb={2}>{label}</Text>
      <Text size='xl' fw={700} c='green'>{value}</Text>
      {(sub || extra) && (
        <Group gap='xs' mt={4}>
          {extra}
          {sub && <Text size='xs' c='dimmed'>{sub}</Text>}
        </Group>
      )}
    </Paper>
  );
}

export default function GroceryDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const today = getIstanbulToday();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['grocery-dashboard', range, today],
    queryFn: () =>
      api.get(endpoints.dashboard, { params: { range, date: today } }).then((r) => r.data),
  });

  const chartData = (data?.chart ?? []).map((d) => ({
    date: formatShortDate(d.date),
    sales: parseFloat(String(d.sales)),
  }));

  const totalSales = parseFloat(String(data?.total_sales ?? 0));
  const netProfit = parseFloat(String(data?.net_profit ?? 0));
  const prevSales = parseFloat(String(data?.prev_sales ?? 0));
  const cashTotal = parseFloat(String(data?.cash_sales ?? 0));
  const cardTotal = parseFloat(String(data?.card_sales ?? 0));
  const cashCardTotal = cashTotal + cardTotal;
  const cashPct = cashCardTotal > 0 ? (cashTotal / cashCardTotal) * 100 : 50;
  const margin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  const days = data
    ? Math.max(1, Math.round((new Date(data.end).getTime() - new Date(data.start).getTime()) / 86400000) + 1)
    : 1;
  const avgDaily = totalSales / days;

  const chartInterval = chartData.length > 14 ? Math.floor(chartData.length / 6) : 0;

  const chartLabel = { today: 'Son 7 Günlük Satış', week: 'Bu Hafta Satışları', month: 'Bu Ay Satışları' }[range];

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
        <Group justify='space-between'>
          <Group gap='xs'>
            <Button variant='subtle' color='gray' px='xs' onClick={() => navigate(-1)} aria-label='Geri dön'>
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
          <StatCard
            label='Satış'
            value={formatCurrency(totalSales)}
            extra={<ComparisonBadge current={totalSales} prev={prevSales} />}
            data-testid='stat-sales'
          />
          <StatCard
            label='Kâr'
            value={formatCurrency(netProfit)}
            data-testid='stat-profit'
          />
          <StatCard
            label='Kâr Marjı'
            value={`%${margin.toFixed(1)}`}
          />
          <StatCard
            label='Günlük Ort.'
            value={formatCurrency(avgDaily)}
          />
          <StatCard
            label='Ürün Adedi'
            value={String(data?.items_sold ?? 0)}
            sub={`${data?.transaction_count ?? 0} işlem`}
            data-testid='stat-items'
          />
          <StatCard
            label='Fire Maliyeti'
            value={formatCurrency(data?.waste_cost ?? 0)}
          />
        </SimpleGrid>

        {/* Cash / Card split */}
        {cashCardTotal > 0 && (
          <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }} data-testid='cash-card-split'>
            <Group justify='space-between' mb={6}>
              <Text size='xs' c='dimmed' fw={600}>NAKİT</Text>
              <Text size='xs' c='dimmed' fw={600}>KART</Text>
            </Group>
            <div
              style={{
                display: 'flex',
                height: 10,
                borderRadius: 6,
                overflow: 'hidden',
                background: 'var(--mantine-color-blue-3)',
              }}
            >
              <div
                style={{
                  width: `${cashPct}%`,
                  background: 'var(--mantine-color-green-5)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <Group justify='space-between' mt={6}>
              <Group gap={4}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--mantine-color-green-5)' }} />
                <Text size='sm' fw={600} c='green'>{formatCurrency(cashTotal)}</Text>
              </Group>
              <Group gap={4}>
                <Text size='sm' fw={600} c='blue'>{formatCurrency(cardTotal)}</Text>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--mantine-color-blue-3)' }} />
              </Group>
            </Group>
          </Paper>
        )}

        {/* Line chart */}
        <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }} data-testid='chart-section'>
          <Text fw={700} mb='md'>{chartLabel}</Text>
          {isLoading ? (
            <Skeleton height={200} radius='md' data-testid='chart-skeleton' />
          ) : (
            <Box h={280}>
              <ResponsiveContainer width='100%' height='100%'>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray='3 3' stroke='#f0f4f0' />
                  <XAxis dataKey='date' tick={{ fontSize: 11 }} interval={chartInterval} />
                  <YAxis tick={{ fontSize: 11 }} width={50} tickFormatter={(v) => `₺${v}`} />
                  <Tooltip formatter={(v) => [`₺${Number(v).toFixed(2)}`, 'Satış']} />
                  <Line
                    type='monotone'
                    dataKey='sales'
                    stroke='var(--mantine-color-green-6)'
                    strokeWidth={2}
                    dot={{ r: 3, fill: 'var(--mantine-color-green-6)', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}
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
                  <Text size='sm' fw={600} c='green'>{formatCurrency(item.revenue)}</Text>
                  <Text size='xs' c='dimmed'>{fmt1(item.quantity)} {item.unit}</Text>
                </Group>
              </Group>
            ))}
            {!data?.best_sellers?.length && (
              <EmptyState icon={IconChartBar} title='Bu dönemde satış yok' />
            )}
          </Stack>
        </Paper>

        {/* Monthly finance summary */}
        <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }}>
          <Text fw={700} mb='sm'>Bu Ay Finans</Text>
          <Stack gap='xs'>
            <Group justify='space-between'>
              <Text size='sm' c='dimmed'>Giderler</Text>
              <Text size='sm' fw={600} c='red'>{formatCurrency(data?.monthly_expenses ?? 0)}</Text>
            </Group>
            <Divider />
            <Group justify='space-between'>
              <Text size='sm' c='dimmed'>Ekstra Gelir</Text>
              <Text size='sm' fw={600} c='green'>{formatCurrency(data?.monthly_income_extra ?? 0)}</Text>
            </Group>
            {parseFloat(String(data?.total_debt_remaining ?? 0)) > 0 && (
              <>
                <Divider />
                <Group justify='space-between'>
                  <Text size='sm' c='dimmed'>Borç Bakiyesi</Text>
                  <Text size='sm' fw={600} c='orange'>{formatCurrency(data?.total_debt_remaining ?? 0)}</Text>
                </Group>
              </>
            )}
          </Stack>
        </Paper>

        {/* Low stock */}
        {!isLoading && (data?.low_stock?.length ?? 0) === 0 && (
          <EmptyState icon={IconCircleCheck} title='Stok seviyeleri normal' />
        )}
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
