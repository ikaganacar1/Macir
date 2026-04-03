import { t } from '../i18n';
import {
  ActionIcon,
  Button,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, endpoints } from '../api';

interface Product {
  pk: number;
  name: string;
  unit: string;
  stock_level: number;
}

interface StockLine {
  product: number;
  name: string;
  unit: string;
  quantity: number;
  purchase_price: number;
}

export default function GroceryAddStock() {
  const navigate = useNavigate();
  
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<StockLine[]>([]);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products'],
    queryFn: () =>
      api.get(endpoints.products).then((r) => r.data),
  });

  const results = useMemo(() => {
    if (search.trim().length < 1) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 8);
  }, [products, search]);

  const addLine = (product: Product) => {
    if (lines.find((l) => l.product === product.pk)) return;
    setLines((prev) => [
      ...prev,
      { product: product.pk, name: product.name, unit: product.unit, quantity: 0, purchase_price: 0 },
    ]);
    setSearch('');
  };

  const updateLine = (index: number, field: 'quantity' | 'purchase_price', value: number) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().split('T')[0];
      // Filter out zero-quantity lines before sending
      const validLines = lines.filter((l) => l.quantity > 0);
      return api.post(endpoints.stockEntries, {
        date: today,
        notes: '',
        items: validLines.map((l) => ({
          product: l.product,
          quantity: l.quantity.toString(),
          purchase_price: l.purchase_price.toString(),
        })),
      });
    },
    onSuccess: () => {
      notifications.show({ message: t`Stock entry saved`, color: 'green' });
      navigate('/');
    },
    onError: () => {
      notifications.show({ message: t`Failed to save stock entry. Please try again.`, color: 'red' });
    },
  });

  const hasValidLines = lines.some((l) => l.quantity > 0);

  return (
    <Stack p='md' gap='sm'>
      <Title order={4}>📦 {t`Add Stock`}</Title>

      <TextInput
        placeholder={t`Search product...`}
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        autoFocus
      />

      {/* Search results */}
      {results.map((product) => (
        <Paper
          key={product.pk}
          withBorder
          p='sm'
          style={{ cursor: 'pointer' }}
          onClick={() => addLine(product)}
        >
          <Group justify='space-between'>
            <div>
              <Text size='sm' fw={600}>{product.name}</Text>
              <Text size='xs' c='dimmed'>
                {t`Current stock`}: {product.stock_level} {product.unit}
              </Text>
            </div>
            <Button size='xs' variant='light'>{t`Add`}</Button>
          </Group>
        </Paper>
      ))}

      {/* Added lines */}
      {lines.length > 0 && (
        <Stack gap='sm'>
          <Text fw={600} size='sm'>{t`Items to add:`}</Text>
          {lines.map((line, i) => (
            <Paper key={line.product} withBorder p='sm'>
              <Group justify='space-between' mb='xs'>
                <Text fw={600} size='sm'>{line.name}</Text>
                <ActionIcon color='red' variant='subtle' onClick={() => removeLine(i)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
              <Group grow>
                <NumberInput
                  label={`${t`Quantity`} (${line.unit})`}
                  value={line.quantity}
                  onChange={(v) => updateLine(i, 'quantity', Number(v) || 0)}
                  min={0}
                  decimalScale={3}
                  size='sm'
                />
                <NumberInput
                  label={t`Purchase price / ` + line.unit}
                  value={line.purchase_price}
                  onChange={(v) => updateLine(i, 'purchase_price', Number(v) || 0)}
                  min={0}
                  decimalScale={2}
                  prefix='₺'
                  size='sm'
                />
              </Group>
            </Paper>
          ))}
          <Button
            color='green'
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
            disabled={!hasValidLines}
          >
            {t`Save Stock Entry`}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
