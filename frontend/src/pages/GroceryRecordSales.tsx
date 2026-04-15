import {
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Group,
  Image,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NumpadInput } from '../components/NumpadInput';
import PageLayout from '../components/PageLayout';
import { api, endpoints } from '../api';
import { getIstanbulToday } from '../utils/format';
import type { Product, DashboardData } from '../types';

interface SaleItem {
  product: number;
  quantity: string;
  sell_price: string;
}

const QUANTITY_PRESETS = {
  kg: ['0.5', '1', '2', '5', '10'],
  piece: ['1', '2', '3', '5', '10'],
};

export default function GroceryRecordSales() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedItems, setSelectedItems] = useState<Record<number, SaleItem>>({});
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalQty, setModalQty] = useState('0');
  const [modalPrice, setModalPrice] = useState(0);
  const [opened, { open, close }] = useDisclosure(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
  });

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ['grocery-dashboard-week'],
    queryFn: () => api.get(endpoints.dashboard, { params: { range: 'week' } }).then((r) => r.data),
  });

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p) => p.category_name).filter(Boolean))];
    return ['all', ...cats];
  }, [products]);

  // Sort: best sellers first, then alphabetical
  const sortedProducts = useMemo(() => {
    const bestSellerIds: number[] = (dashboardData?.best_sellers ?? []).map((b) => b.product_id);
    return [...products].sort((a, b) => {
      const rankA = bestSellerIds.indexOf(a.pk);
      const rankB = bestSellerIds.indexOf(b.pk);
      if (rankA !== -1 && rankB !== -1) return rankA - rankB;
      if (rankA !== -1) return -1;
      if (rankB !== -1) return 1;
      return a.name.localeCompare(b.name, 'tr');
    });
  }, [products, dashboardData]);

  const filteredProducts = useMemo(() => {
    let list = sortedProducts;
    if (activeCategory !== 'all') {
      list = list.filter((p) => p.category_name === activeCategory);
    }
    if (search.trim()) {
      list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    }
    return list;
  }, [sortedProducts, activeCategory, search]);

  const openModal = (product: Product) => {
    setModalProduct(product);
    setModalQty(selectedItems[product.pk]?.quantity ?? '0');
    setModalPrice(parseFloat(product.sell_price));
    open();
  };

  const confirmItem = () => {
    if (!modalProduct) return;
    if (!modalQty || parseFloat(modalQty) <= 0) {
      // Remove item if quantity set to 0
      setSelectedItems((prev) => {
        const next = { ...prev };
        delete next[modalProduct.pk];
        return next;
      });
      close();
      return;
    }
    setSelectedItems((prev) => ({
      ...prev,
      [modalProduct.pk]: {
        product: modalProduct.pk,
        quantity: modalQty,
        sell_price: modalPrice.toFixed(2),
      },
    }));
    close();
  };

  const totalRevenue = Object.values(selectedItems).reduce((sum, item) => {
    const qtyCents = Math.round(parseFloat(item.quantity) * 1000);
    const priceCents = Math.round(parseFloat(item.sell_price) * 100);
    return sum + qtyCents * priceCents;
  }, 0) / 100000;

  const selectedCount = Object.keys(selectedItems).length;

  const saveMutation = useMutation({
    mutationFn: () => {
      const today = getIstanbulToday();
      return api.post(endpoints.saleRecords, {
        date: today,
        payment_method: paymentMethod,
        notes: '',
        items: Object.values(selectedItems),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-products'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-week'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      notifications.show({ message: 'Satış kaydedildi!', color: 'green' });
      navigate('/');
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.items?.[0] ??
        err?.response?.data?.detail ??
        'Satış kaydedilemedi — stok yetersiz olabilir';
      notifications.show({ message: msg, color: 'red' });
    },
  });

  const presets = modalProduct
    ? QUANTITY_PRESETS[modalProduct.unit as keyof typeof QUANTITY_PRESETS] ?? QUANTITY_PRESETS.kg
    : [];

  return (
    <PageLayout
      header={
        <Group justify='space-between'>
          <Group gap='xs'>
            <Button variant='subtle' color='gray' px='xs' onClick={() => navigate(-1)} aria-label='Geri dön'>
              <IconArrowLeft size={20} />
            </Button>
            <Title order={4}>Satış Yap</Title>
          </Group>
          {selectedCount > 0 && (
            <Badge size='lg' color='green'>{selectedCount} ürün</Badge>
          )}
        </Group>
      }
      footer={selectedCount > 0 ? (
        <Box
          style={{
            background: 'var(--mantine-color-green-6)',
            padding: '12px 16px',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <Stack gap='xs'>
            <Group justify='space-between' align='flex-start'>
              <Stack gap={2}>
                <Text c='white' fw={700} size='lg'>
                  Toplam: ₺{totalRevenue.toFixed(2)}
                </Text>
                <Text c='white' size='xs' opacity={0.85}>
                  {selectedCount} ürün seçildi
                </Text>
              </Stack>
              <Box style={{ position: 'relative', maxWidth: '55%' }}>
                <Box
                  style={{
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0,
                    width: 16,
                    background: 'linear-gradient(to right, var(--mantine-color-green-6), transparent)',
                    zIndex: 1,
                    pointerEvents: 'none',
                  }}
                />
                <ScrollArea>
                  <Group gap='xs' wrap='nowrap'>
                    {Object.entries(selectedItems).map(([pk, item]) => {
                      const product = products.find((p) => p.pk === Number(pk));
                      return (
                        <Badge
                          key={pk}
                          color='white'
                          c='green'
                          style={{ cursor: 'pointer', flexShrink: 0 }}
                          onClick={() => {
                            const p = products.find((x) => x.pk === Number(pk));
                            if (p) openModal(p);
                          }}
                        >
                          {product?.name} ×{item.quantity}
                        </Badge>
                      );
                    })}
                  </Group>
                </ScrollArea>
                <Box
                  style={{
                    position: 'absolute',
                    right: 0, top: 0, bottom: 0,
                    width: 16,
                    background: 'linear-gradient(to left, var(--mantine-color-green-6), transparent)',
                    zIndex: 1,
                    pointerEvents: 'none',
                  }}
                />
              </Box>
            </Group>
            <Button
              color='white'
              variant='white'
              c='green'
              size='md'
              fullWidth
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
            >
              Tamamla →
            </Button>
          </Stack>
        </Box>
      ) : undefined}
      footerPadding={140}
    >
      {/* Search */}
      <TextInput
        placeholder='Ürün ara...'
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        size='md'
      />

      {/* Payment method toggle */}
      <SegmentedControl
        value={paymentMethod}
        onChange={(v) => setPaymentMethod(v as 'cash' | 'card')}
        data={[
          { label: 'Nakit', value: 'cash' },
          { label: 'Kart', value: 'card' },
        ]}
        color='green'
        fullWidth
      />

      {/* Category chips */}
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
              {cat === 'all' ? 'Tümü' : cat}
            </Chip>
          ))}
        </Group>
      </ScrollArea>

      {/* Product card grid */}
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing='sm'>
        {filteredProducts.map((product) => {
          const isSelected = !!selectedItems[product.pk];
          const isLowStock = (product.stock_level ?? 999) <= parseFloat(String(product.low_stock_threshold ?? '2'));
          return (
            <Paper
              key={product.pk}
              withBorder
              p='sm'
              style={{
                cursor: 'pointer',
                position: 'relative',
                border: isSelected
                  ? '2px solid var(--mantine-color-green-6)'
                  : '1px solid #e8f5e9',
                background: isSelected ? 'var(--mantine-color-green-0)' : 'white',
                minHeight: 90,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: 4,
              }}
              onClick={() => openModal(product)}
            >
              {/* Low stock badge */}
              {isLowStock && (
                <Badge
                  data-testid="low-stock-indicator"
                  size='xs'
                  color='orange'
                  variant='filled'
                  style={{ position: 'absolute', top: 4, right: 4 }}
                >
                  Az
                </Badge>
              )}
              {/* Selected badge */}
              {isSelected && (
                <Box style={{ position: 'absolute', top: 4, left: 4 }}>
                  <Badge size='xs' color='green' variant='filled'>
                    ✓ {selectedItems[product.pk].quantity}
                  </Badge>
                </Box>
              )}
              {product.svg_icon && (
                <Image src={product.svg_icon} h={28} w={28} fit='contain' mb={2} />
              )}
              <Text fw={600} size='xs' lineClamp={2} style={{ lineHeight: 1.3 }}>
                {product.name}
              </Text>
              <Text size='xs' c='dimmed'>{product.unit}</Text>
              <Text size='sm' fw={700} c='green'>
                ₺{parseFloat(product.sell_price).toFixed(2)}
              </Text>
              {(() => {
                const stockColor =
                  product.stock_level <= 0
                    ? 'red'
                    : isLowStock
                    ? 'orange'
                    : 'dimmed';
                return (
                  <Text size='xs' c={stockColor} fw={500}>
                    {parseFloat(String(product.stock_level))} {product.unit}
                  </Text>
                );
              })()}
            </Paper>
          );
        })}
      </SimpleGrid>

      {filteredProducts.length === 0 && (
        <Text c='dimmed' ta='center' size='sm'>Ürün bulunamadı</Text>
      )}

      {/* Quantity Modal */}
      <Modal opened={opened} onClose={close} title={modalProduct?.name} centered size='sm'>
        {modalProduct && (
          <Stack>
            <Group justify='center' gap='xl'>
              <Box ta='center'>
                <Text size='xs' c='dimmed'>Fiyat</Text>
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
                <Text size='xs' c='dimmed'>Mevcut Stok</Text>
                <Text fw={700} c={(modalProduct.stock_level ?? 999) < 5 ? 'orange' : 'green'}>
                  {modalProduct.stock_level ?? '?'} {modalProduct.unit}
                </Text>
              </Box>
            </Group>

            <Divider />

            <Text size='xs' fw={700} ta='center'>Hızlı Seçim</Text>
            <SimpleGrid cols={5} spacing='xs'>
              {presets.map((preset) => (
                <Button
                  key={preset}
                  variant={modalQty === preset ? 'filled' : 'light'}
                  color='green'
                  size='xs'
                  onClick={() => setModalQty(preset)}
                >
                  {preset}
                </Button>
              ))}
            </SimpleGrid>

            <Text size='xs' fw={700} ta='center' mt='xs'>Özel Miktar</Text>
            <NumpadInput value={modalQty} onChange={setModalQty} />

            <Group grow mt='md'>
              <Button variant='default' onClick={close}>İptal</Button>
              <Button
                color='green'
                onClick={confirmItem}
                disabled={parseFloat(modalQty) <= 0}
              >
                Ekle · ₺{(parseFloat(modalQty || '0') * modalPrice).toFixed(2)}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </PageLayout>
  );
}
