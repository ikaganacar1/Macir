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
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NumpadInput } from '../components/NumpadInput';
import { api, endpoints } from '../api';
import type { Product } from '../types';

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

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedItems, setSelectedItems] = useState<Record<number, SaleItem>>({});
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalQty, setModalQty] = useState('0');
  const [modalPrice, setModalPrice] = useState(0);
  const [opened, { open, close }] = useDisclosure(false);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['grocery-dashboard-week'],
    queryFn: () => api.get(endpoints.dashboard, { params: { range: 'week' } }).then((r) => r.data),
  });

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p) => p.category_name).filter(Boolean))];
    return ['all', ...cats];
  }, [products]);

  // Sort: best sellers first, then alphabetical
  const sortedProducts = useMemo(() => {
    const bestSellerIds: number[] = (dashboardData?.best_sellers ?? []).map((b: any) => b.product_id);
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

  const totalRevenue = Object.values(selectedItems).reduce(
    (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.sell_price),
    0
  );

  const selectedCount = Object.keys(selectedItems).length;

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
      notifications.show({ message: 'Satış kaydedildi!', color: 'green' });
      navigate('/');
    },
    onError: () => {
      notifications.show({ message: 'Satış kaydedilemedi', color: 'red' });
    },
  });

  const presets = modalProduct
    ? QUANTITY_PRESETS[modalProduct.unit as keyof typeof QUANTITY_PRESETS] ?? QUANTITY_PRESETS.kg
    : [];

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
            <Title order={4}>Satış Yap</Title>
          </Group>
          {selectedCount > 0 && (
            <Badge size='lg' color='green'>{selectedCount} ürün</Badge>
          )}
        </Group>
      </Box>

      <Stack p='md' gap='md' style={{ paddingBottom: selectedCount > 0 ? 140 : 16 }}>
        {/* Search */}
        <TextInput
          placeholder='Ürün ara...'
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size='md'
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
        <SimpleGrid cols={3} spacing='sm'>
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
                {/* Low stock dot */}
                {isLowStock && (
                  <Box
                    data-testid="low-stock-indicator"
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--mantine-color-orange-5)',
                    }}
                  />
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
              </Paper>
            );
          })}
        </SimpleGrid>

        {filteredProducts.length === 0 && (
          <Text c='dimmed' ta='center' size='sm'>Ürün bulunamadı</Text>
        )}
      </Stack>

      {/* Sticky footer */}
      {selectedCount > 0 && (
        <Box
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--mantine-color-green-6)',
            padding: '12px 16px',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
          }}
        >
          <Stack gap='xs'>
            <Group justify='space-between'>
              <Text c='white' fw={700} size='lg'>
                Toplam: ₺{totalRevenue.toFixed(2)}
              </Text>
              <ScrollArea style={{ maxWidth: '55%' }}>
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
    </Stack>
  );
}
