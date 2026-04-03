import { t } from '../i18n';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  SimpleGrid,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconPackage, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, endpoints } from '../api';

interface Product {
  pk: number;
  name: string;
  unit: string;
  stock_level: number;
  low_stock_threshold: number;
  category_name: string;
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
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<StockLine[]>([]);
  const [recentlyAdded, setRecentlyAdded] = useState<number[]>([]);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['grocery-dashboard'],
    queryFn: () => api.get(endpoints.dashboard, { params: { range: 'today' } }).then((r) => r.data),
  });

  // Prioritize low stock items for quick restocking
  const lowStockProducts = useMemo(() => {
    return products
      .filter((p) => p.stock_level <= p.low_stock_threshold)
      .sort((a, b) => a.stock_level - b.stock_level)
      .slice(0, 8);
  }, [products]);

  // Recently stocked items (from cache)
  const recentProducts = useMemo(() => {
    return products.filter((p) => recentlyAdded.includes(p.pk)).slice(0, 4);
  }, [products, recentlyAdded]);

  const searchResults = useMemo(() => {
    if (search.trim().length < 1) return [];
    return products
      .filter((p) => !lines.find((l) => l.product === p.pk)) // Exclude already added
      .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 6);
  }, [products, search, lines]);

  const addLine = (product: Product, quickQty?: number) => {
    if (lines.find((l) => l.product === product.pk)) {
      // If already exists, increment quantity
      updateLine(
        lines.findIndex((l) => l.product === product.pk),
        'quantity',
        quickQty || 1
      );
      return;
    }
    
    setLines((prev) => [
      ...prev,
      { 
        product: product.pk, 
        name: product.name, 
        unit: product.unit, 
        quantity: quickQty || 0, 
        purchase_price: 0 
      },
    ]);
    
    if (quickQty) {
      setRecentlyAdded((prev) => [product.pk, ...prev.slice(0, 4)]);
    }
    
    setSearch('');
  };

  const updateLine = (index: number, field: 'quantity' | 'purchase_price', value: number) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== index) return l;
      if (field === 'quantity') {
        return { ...l, quantity: value };
      }
      return { ...l, purchase_price: value };
    }));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().split('T')[0];
      const validLines = lines.filter((l) => l.quantity > 0 && l.purchase_price > 0);
      
      if (validLines.length === 0) {
        throw new Error('No valid items');
      }

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
      queryClient.invalidateQueries({ queryKey: ['grocery-products'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard'] });
      notifications.show({ message: t`Stock entry saved!`, color: 'green' });
      navigate('/');
    },
    onError: () => {
      notifications.show({ message: t`Failed to save`, color: 'red' });
    },
  });

  const totalCost = lines.reduce((sum, l) => sum + (l.quantity * l.purchase_price), 0);
  const totalItems = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <Stack p='md' gap='md'>
      <Title order={4}>📦 {t`Add Stock`}</Title>

      {/* Low Stock Alert - Priority Restocking */}
      {lowStockProducts.length > 0 && lines.length === 0 && (
        <Card withBorder color='orange' bg='orange.0' style={{ borderColor: 'var(--mantine-color-orange-3)' }}>
          <Group gap='xs' mb='sm'>
            <IconAlertCircle color='var(--mantine-color-orange-5)' />
            <Text fw={700} size='sm' c='orange'>Low Stock - Restock Now</Text>
          </Group>
          <SimpleGrid cols={2} spacing='xs'>
            {lowStockProducts.map((product) => (
              <Button
                key={product.pk}
                variant='light'
                color='orange'
                size='xs'
                onClick={() => addLine(product)}
                justify='space-between'
                rightSection={
                  <Badge size='xs' color='red' variant='filled'>
                    {product.stock_level} left
                  </Badge>
                }
              >
                {product.name}
              </Button>
            ))}
          </SimpleGrid>
        </Card>
      )}

      {/* Recently Stocked Quick Add */}
      {recentProducts.length > 0 && (
        <Paper withBorder p='sm' radius='md'>
          <Text size='xs' fw={700} c='dimmed' mb='sm' tt='uppercase'>Recently Stocked</Text>
          <Group gap='xs'>
            {recentProducts.map((product) => (
              <Button
                key={product.pk}
                variant='outline'
                color='blue'
                size='xs'
                onClick={() => addLine(product)}
                leftSection={<IconPlus size={12} />}
              >
                {product.name}
              </Button>
            ))}
          </Group>
        </Paper>
      )}

      {/* Search */}
      <TextInput
        placeholder={t`Search to add more products...`}
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        size='md'
      />

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Paper withBorder p='sm' radius='md'>
          <Text size='xs' c='dimmed' mb='xs'>Tap to add:</Text>
          <Group gap='xs'>
            {searchResults.map((product) => (
              <Button
                key={product.pk}
                variant='light'
                color='blue'
                onClick={() => addLine(product)}
                size='sm'
              >
                {product.name}
              </Button>
            ))}
          </Group>
        </Paper>
      )}

      {/* Added Lines with Quick Quantity Buttons */}
      {lines.length > 0 && (
        <Stack gap='sm'>
          <Text fw={700} size='sm'>{t`Stock Entry Items`}</Text>
          <ScrollArea h={lines.length > 3 ? 300 : undefined}>
            <Stack gap='sm'>
              {lines.map((line, i) => (
                <Paper key={line.product} withBorder p='sm' radius='md' shadow='sm'>
                  <Group justify='space-between' mb='xs'>
                    <Group gap='xs'>
                      <IconPackage size={18} color='var(--mantine-color-blue-5)' />
                      <Text fw={600}>{line.name}</Text>
                      <Badge size='sm' variant='light'>{line.unit}</Badge>
                    </Group>
                    <ActionIcon color='red' variant='subtle' onClick={() => removeLine(i)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                  
                  <Grid gutter='xs'>
                    <Grid.Col span={6}>
                      <NumberInput
                        label={t`Quantity`}
                        value={line.quantity}
                        onChange={(v) => updateLine(i, 'quantity', Number(v) || 0)}
                        min={0}
                        decimalScale={3}
                        size='sm'
                        rightSection={<Text size='xs' c='dimmed' pr='sm'>{line.unit}</Text>}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <NumberInput
                        label={t`Purchase Price`}
                        value={line.purchase_price}
                        onChange={(v) => updateLine(i, 'purchase_price', Number(v) || 0)}
                        min={0}
                        decimalScale={2}
                        prefix='₺'
                        size='sm'
                      />
                    </Grid.Col>
                  </Grid>

                  {/* Quick quantity buttons */}
                  <Group gap='xs' mt='xs'>
                    {[1, 5, 10, 25].map((qty) => (
                      <Button
                        key={qty}
                        size='xs'
                        variant='subtle'
                        color='gray'
                        onClick={() => updateLine(i, 'quantity', line.quantity + qty)}
                      >
                        +{qty}
                      </Button>
                    ))}
                  </Group>
                </Paper>
              ))}
            </Stack>
          </ScrollArea>

          {/* Summary Footer */}
          <Paper withBorder p='sm' radius='md' bg='gray.0'>
            <Group justify='space-between' mb='sm'>
              <Text size='sm'>Items: <b>{lines.length}</b></Text>
              <Text size='sm'>Total Qty: <b>{totalItems.toFixed(1)}</b></Text>
              <Text size='sm' fw={700} c='blue'>Total Cost: ₺{totalCost.toFixed(2)}</Text>
            </Group>
            <Button
              color='green'
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              fullWidth
              size='md'
              disabled={!lines.some((l) => l.quantity > 0 && l.purchase_price > 0)}
            >
              {t`Save Stock Entry`}
            </Button>
          </Paper>
        </Stack>
      )}

      {lines.length === 0 && !search && lowStockProducts.length === 0 && (
        <Paper withBorder p='xl' radius='md' style={{ textAlign: 'center' }}>
          <IconPackage size={48} color='var(--mantine-color-gray-3)' style={{ margin: '0 auto' }} />
          <Text c='dimmed' mt='sm'>Search for products or check low stock alerts above</Text>
        </Paper>
      )}
    </Stack>
  );
}