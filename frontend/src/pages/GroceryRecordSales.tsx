import { t } from '../i18n';
import {
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  Group,
  Image,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconClock, IconFlame, IconSearch, IconTrendingUp } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NumpadInput } from '../components/NumpadInput';
import { api, endpoints } from '../api';

interface Product {
  pk: number;
  name: string;
  unit: string;
  sell_price: string;
  svg_icon: string | null;
  category_name: string;
  stock_level?: number;
}

interface SaleItem {
  product: number;
  quantity: string;
  sell_price: string;
}

interface SaleRecord {
  pk: number;
  items: { product: number; product_name: string; quantity: string }[];
}

// Quick quantity presets based on unit type
const QUANTITY_PRESETS = {
  kg: ['0.5', '1', '2', '5', '10'],
  piece: ['1', '2', '3', '5', '10'],
};

export default function GroceryRecordSales() {
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedItems, setSelectedItems] = useState<Record<number, SaleItem>>({});
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalQty, setModalQty] = useState('0');
  const [modalPrice, setModalPrice] = useState(0);
  const [opened, { open, close }] = useDisclosure(false);

  // Fetch products with stock levels
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
  });

  // Fetch recent sales for "Quick Reorder" feature
  const { data: recentSales = [] } = useQuery<SaleRecord[]>({
    queryKey: ['grocery-recent-sales'],
    queryFn: () => api.get(endpoints.saleRecords, { params: { limit: 5 } }).then((r) => r.data.slice(0, 5)),
  });

  // Calculate top selling products (last 7 days)
  const { data: dashboardData } = useQuery({
    queryKey: ['grocery-dashboard-week'],
    queryFn: () => api.get(endpoints.dashboard, { params: { range: 'week' } }).then((r) => r.data),
  });

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p) => p.category_name).filter(Boolean))];
    return ['all', ...cats];
  }, [products]);

  // Quick picks: Best sellers from dashboard
  const topProducts = useMemo(() => {
    if (!dashboardData?.best_sellers) return [];
    const bestSellerIds = dashboardData.best_sellers.slice(0, 6).map((b: any) => b.product_id);
    return products.filter((p) => bestSellerIds.includes(p.pk));
  }, [products, dashboardData]);

  // Recent items: From last sale records
  const recentItems = useMemo(() => {
    const recentProductIds = new Set<number>();
    recentSales.forEach((sale) => {
      sale.items?.forEach((item) => {
        if (recentProductIds.size < 6) recentProductIds.add(item.product);
      });
    });
    return products.filter((p) => recentProductIds.has(p.pk));
  }, [products, recentSales]);

  // Low stock items to warn about
  const lowStockItems = useMemo(() => {
    return products.filter((p) => (p.stock_level ?? 0) <= 2).slice(0, 4);
  }, [products]);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = activeCategory === 'all' || p.category_name === activeCategory;
      return matchSearch && matchCat;
    });
  }, [products, search, activeCategory]);

  const openModal = (product: Product, initialQty: string = '0') => {
    setModalProduct(product);
    setModalQty(initialQty);
    setModalPrice(parseFloat(product.sell_price));
    open();
  };

  const quickAdd = (product: Product, qty: string) => {
    setSelectedItems((prev) => ({
      ...prev,
      [product.pk]: {
        product: product.pk,
        quantity: qty,
        sell_price: product.sell_price,
      },
    }));
    notifications.show({
      message: `${product.name} × ${qty} ${product.unit} added`,
      color: 'green',
      autoClose: 1000,
    });
  };

  const confirmItem = () => {
    if (!modalProduct || modalQty === '0') return;
    quickAdd(modalProduct, modalQty);
    close();
  };

  const totalRevenue = Object.values(selectedItems).reduce(
    (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.sell_price),
    0
  );

  const totalItems = Object.values(selectedItems).reduce(
    (sum, item) => sum + parseFloat(item.quantity),
    0
  );

  const saveMutation = useMutation({
    mutationFn: () => {
      const today = new Date().toISOString().split('T')[0];
      return api.post(endpoints.saleRecords, {
        date: today,
        notes: '',
        items: Object.values(selectedItems),
      });
    },
    onSuccess: () => {
      notifications.show({ message: t`Sale saved successfully!`, color: 'green' });
      navigate('/');
    },
    onError: () => {
      notifications.show({ message: t`Failed to save sale`, color: 'red' });
    },
  });

  const presets = modalProduct ? QUANTITY_PRESETS[modalProduct.unit as keyof typeof QUANTITY_PRESETS] || QUANTITY_PRESETS.kg : [];

  return (
    <Stack p='md' gap='md'>
      <Group justify='space-between'>
        <Title order={4}>🛒 {t`Quick Sale`}</Title>
        <Badge size='lg' color='green' variant='light'>
          {Object.keys(selectedItems).length} items
        </Badge>
      </Group>

      {/* Search with instant results */}
      <TextInput
        placeholder={t`Search products...`}
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        size='md'
        autoFocus
      />

      {/* Category quick filter */}
      {!search && (
        <ScrollArea>
          <Group gap='xs' wrap='nowrap'>
            {categories.map((cat) => (
              <Chip
                key={cat}
                checked={activeCategory === cat}
                onChange={() => setActiveCategory(cat)}
                color='green'
                size='sm'
              >
                {cat === 'all' ? t`All` : cat}
              </Chip>
            ))}
          </Group>
        </ScrollArea>
      )}

      {/* Search Results - if searching */}
      {search && (
        <Paper withBorder p='sm' radius='md'>
          <Text size='xs' fw={700} c='dimmed' mb='sm' tt='uppercase'>
            {t`Search Results`}
          </Text>
          <SimpleGrid cols={3} spacing='xs'>
            {filtered.map((product) => (
              <Button
                key={product.pk}
                variant={selectedItems[product.pk] ? 'filled' : 'light'}
                color='green'
                onClick={() => openModal(product)}
                h='auto'
                p='xs'
                style={{ flexDirection: 'column' }}
              >
                <Text size='xs' fw={600} lineClamp={1}>{product.name}</Text>
                <Text size='10px'>₺{product.sell_price}</Text>
              </Button>
            ))}
          </SimpleGrid>
          {filtered.length === 0 && (
            <Text size='sm' c='dimmed' ta='center'>No products found</Text>
          )}
        </Paper>
      )}

      {/* Top Selling - Quick Pick */}
      {!search && topProducts.length > 0 && (
        <Paper withBorder p='sm' radius='md' style={{ borderLeft: '4px solid var(--mantine-color-orange-5)' }}>
          <Group gap='xs' mb='sm'>
            <IconFlame size={16} color='var(--mantine-color-orange-5)' />
            <Text size='xs' fw={700} tt='uppercase'>Popular Items</Text>
          </Group>
          <SimpleGrid cols={3} spacing='xs'>
            {topProducts.map((product) => (
              <Button
                key={product.pk}
                variant={selectedItems[product.pk] ? 'filled' : 'light'}
                color='orange'
                onClick={() => openModal(product, product.unit === 'piece' ? '1' : '0.5')}
                h='auto'
                p='xs'
                style={{ flexDirection: 'column' }}
              >
                <Text size='xs' fw={600} lineClamp={1}>{product.name}</Text>
                <Text size='10px'>₺{product.sell_price}</Text>
              </Button>
            ))}
          </SimpleGrid>
        </Paper>
      )}

      {/* Recently Sold - Quick Reorder */}
      {!search && recentItems.length > 0 && (
        <Paper withBorder p='sm' radius='md' style={{ borderLeft: '4px solid var(--mantine-color-blue-5)' }}>
          <Group gap='xs' mb='sm'>
            <IconClock size={16} color='var(--mantine-color-blue-5)' />
            <Text size='xs' fw={700} tt='uppercase'>Recent</Text>
          </Group>
          <Group gap='xs'>
            {recentItems.map((product) => (
              <Button
                key={product.pk}
                variant={selectedItems[product.pk] ? 'filled' : 'outline'}
                color='blue'
                onClick={() => openModal(product, product.unit === 'piece' ? '1' : '0.5')}
                size='xs'
                leftSection={product.svg_icon ? <Image src={product.svg_icon} w={16} h={16} /> : undefined}
              >
                {product.name}
              </Button>
            ))}
          </Group>
        </Paper>
      )}

      {/* Low Stock Warning in Sales */}
      {!search && lowStockItems.length > 0 && (
        <Paper withBorder p='sm' radius='md' bg='orange.0' style={{ borderColor: 'var(--mantine-color-orange-3)' }}>
          <Group gap='xs' mb='xs'>
            <IconTrendingUp size={16} color='var(--mantine-color-orange-5)' />
            <Text size='xs' fw={700} c='orange'>Low Stock Warning</Text>
          </Group>
          <Text size='xs' c='dimmed' mb='sm'>These items are running low:</Text>
          <Group gap='xs'>
            {lowStockItems.map((item) => (
              <Badge key={item.pk} color='orange' variant='dot' size='sm'>
                {item.name} ({item.stock_level} left)
              </Badge>
            ))}
          </Group>
        </Paper>
      )}

      {/* Selected Items Summary */}
      {Object.keys(selectedItems).length > 0 && (
        <Paper
          withBorder
          p='sm'
          radius='md'
          style={{ 
            background: 'var(--mantine-color-green-6)', 
            position: 'sticky', 
            bottom: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <Stack gap='xs'>
            <Group justify='space-between'>
              <Text c='white' fw={700} size='lg'>
                ₺{totalRevenue.toFixed(2)}
              </Text>
              <Text c='white' size='sm' opacity={0.9}>
                {totalItems.toFixed(1)} units
              </Text>
            </Group>
            <Group gap='xs' style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
              {Object.entries(selectedItems).map(([pk, item]) => {
                const product = products.find((p) => p.pk === Number(pk));
                return (
                  <Badge 
                    key={pk} 
                    color='white' 
                    c='green' 
                    size='lg'
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      const p = products.find((x) => x.pk === Number(pk));
                      if (p) openModal(p, item.quantity);
                    }}
                  >
                    {product?.name} ×{item.quantity}
                  </Badge>
                );
              })}
            </Group>
            <Button
              color='white'
              variant='white'
              c='green'
              size='md'
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              fullWidth
            >
              {t`Complete Sale`} →
            </Button>
          </Stack>
        </Paper>
      )}

      {/* Quantity Modal with Presets */}
      <Modal opened={opened} onClose={close} title={modalProduct?.name} centered size='sm'>
        {modalProduct && (
          <Stack>
            <Group justify='center' gap='xl'>
              <Box ta='center'>
                <Text size='xs' c='dimmed'>Price</Text>
                <NumberInput
                  value={modalPrice}
                  onChange={(v) => setModalPrice(Number(v) || 0)}
                  min={0}
                  decimalScale={2}
                  prefix='₺'
                  size='sm'
                  w={100}
                />
              </Box>
              <Box ta='center'>
                <Text size='xs' c='dimmed'>Stock Available</Text>
                <Text fw={700} c={modalProduct.stock_level && modalProduct.stock_level < 5 ? 'orange' : 'green'}>
                  {modalProduct.stock_level ?? 'N/A'} {modalProduct.unit}
                </Text>
              </Box>
            </Group>

            <Divider />

            {/* Quick Quantity Presets */}
            <Text size='xs' fw={700} ta='center'>Quick Select</Text>
            <SimpleGrid cols={5} spacing='xs'>
              {presets.map((preset) => (
                <Button
                  key={preset}
                  variant={modalQty === preset ? 'filled' : 'light'}
                  color='green'
                  size='xs'
                  onClick={() => setModalQty(preset)}
                >
                  +{preset}
                </Button>
              ))}
            </SimpleGrid>

            <Text size='xs' fw={700} ta='center' mt='xs'>Or Enter Custom</Text>
            <NumpadInput value={modalQty} onChange={setModalQty} />

            <Group grow mt='md'>
              <Button variant='default' onClick={close}>{t`Cancel`}</Button>
              <Button
                color='green'
                onClick={confirmItem}
                disabled={modalQty === '0' || parseFloat(modalQty) <= 0}
              >
                {t`Add`} · ₺{(parseFloat(modalQty || '0') * modalPrice).toFixed(2)}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}