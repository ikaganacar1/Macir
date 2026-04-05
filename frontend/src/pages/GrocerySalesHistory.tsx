import {
  Box,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { SaleRecord } from '../types';

type DateRange = 'all' | 'today' | 'week' | 'month';

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getFirstOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

function recordTotal(record: SaleRecord): string {
  const total = record.items.reduce(
    (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.sell_price),
    0
  );
  return total.toFixed(2);
}

function trFullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function applyFilters(
  records: SaleRecord[],
  dateRange: DateRange,
  search: string
): SaleRecord[] {
  const today = getToday();
  const monday = getMonday();
  const firstOfMonth = getFirstOfMonth();
  const q = search.toLowerCase();

  return records.filter((r) => {
    if (dateRange === 'today' && r.date !== today) return false;
    if (dateRange === 'week' && r.date < monday) return false;
    if (dateRange === 'month' && r.date < firstOfMonth) return false;
    if (q && !r.items.some((item) => item.product_name.toLowerCase().includes(q))) return false;
    return true;
  });
}

export default function GrocerySalesHistory() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: records = [], isLoading } = useQuery<SaleRecord[]>({
    queryKey: ['sale-records'],
    queryFn: () => api.get(endpoints.saleRecords).then((r) => r.data),
  });

  const filtered = applyFilters(records, dateRange, search);

  function toggleExpanded(pk: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  }

  const dateButtons: { label: string; value: DateRange }[] = [
    { label: 'Tümü', value: 'all' },
    { label: 'Bugün', value: 'today' },
    { label: 'Bu Hafta', value: 'week' },
    { label: 'Bu Ay', value: 'month' },
  ];

  return (
    <Stack gap={0} style={{ minHeight: '100vh', background: '#f9faf7' }}>
      {/* Sticky header */}
      <Box
        p='md'
        style={{
          position: 'sticky',
          top: 0,
          background: '#f9faf7',
          zIndex: 10,
          borderBottom: '1px solid #e8f5e9',
        }}
      >
        <Group>
          <Button
            variant='subtle'
            color='gray'
            px='xs'
            data-testid='btn-back'
            onClick={() => navigate(-1)}
            leftSection={<IconArrowLeft size={18} />}
          >
            {''}
          </Button>
          <Title order={4}>Satış Geçmişi</Title>
        </Group>
      </Box>

      {/* Filter bar */}
      <Stack p='md' gap='sm'>
        <Group gap='xs'>
          {dateButtons.map((btn) => (
            <Button
              key={btn.value}
              size='xs'
              variant={dateRange === btn.value ? 'filled' : 'light'}
              color='green'
              onClick={() => setDateRange(btn.value)}
            >
              {btn.label}
            </Button>
          ))}
        </Group>
        <TextInput
          placeholder='Ürün ara...'
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size='sm'
        />
      </Stack>

      {/* Record list */}
      <Stack px='md' pb='md' gap='sm'>
        {isLoading ? (
          [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={56} radius='md' />)
        ) : records.length === 0 ? (
          <Text c='dimmed' ta='center' py='xl'>Henüz satış yok</Text>
        ) : filtered.length === 0 ? (
          <Text c='dimmed' ta='center' py='xl'>Sonuç bulunamadı</Text>
        ) : (
          filtered.map((record) => {
            const isOpen = expanded.has(record.pk);
            return (
              <Paper
                key={record.pk}
                withBorder
                style={{ border: '1px solid #e8f5e9', overflow: 'hidden' }}
              >
                <Group
                  justify='space-between'
                  p='sm'
                  style={{ cursor: 'pointer' }}
                  data-testid={`sale-card-${record.pk}`}
                  onClick={() => toggleExpanded(record.pk)}
                >
                  <Text size='sm'>{trFullDate(record.date)}</Text>
                  <Group gap='xs'>
                    <Text size='sm' fw={700} c='green'>₺{recordTotal(record)}</Text>
                    {isOpen
                      ? <IconChevronUp size={16} color='gray' />
                      : <IconChevronDown size={16} color='gray' />}
                  </Group>
                </Group>

                {isOpen && (
                  <Box
                    data-testid={`sale-items-${record.pk}`}
                    px='sm'
                    pb='sm'
                    style={{ borderTop: '1px solid #e8f5e9' }}
                  >
                    {/* Column header */}
                    <Group justify='space-between' py='xs'>
                      <Text size='xs' c='dimmed' fw={600} style={{ flex: 3 }}>ÜRÜN</Text>
                      <Text size='xs' c='dimmed' fw={600} style={{ flex: 1, textAlign: 'right' }}>MİKTAR</Text>
                      <Text size='xs' c='dimmed' fw={600} style={{ flex: 1, textAlign: 'right' }}>FİYAT</Text>
                      <Text size='xs' c='dimmed' fw={600} style={{ flex: 1, textAlign: 'right' }}>TOPLAM</Text>
                    </Group>

                    {record.items.map((item) => {
                      const lineTotal = (
                        parseFloat(item.quantity) * parseFloat(item.sell_price)
                      ).toFixed(2);
                      return (
                        <Group key={item.pk} justify='space-between' py={4}>
                          <Text size='sm' style={{ flex: 3 }}>{item.product_name}</Text>
                          <Text size='sm' style={{ flex: 1, textAlign: 'right' }}>
                            {parseFloat(item.quantity).toFixed(2)}
                          </Text>
                          <Text size='sm' style={{ flex: 1, textAlign: 'right' }}>
                            ₺{parseFloat(item.sell_price).toFixed(2)}
                          </Text>
                          <Text size='sm' fw={600} style={{ flex: 1, textAlign: 'right' }}>
                            ₺{lineTotal}
                          </Text>
                        </Group>
                      );
                    })}

                    {record.notes ? (
                      <Text size='xs' c='dimmed' pt='xs' style={{ borderTop: '1px solid #f0f0f0' }}>
                        {record.notes}
                      </Text>
                    ) : null}
                  </Box>
                )}
              </Paper>
            );
          })
        )}
      </Stack>
    </Stack>
  );
}
