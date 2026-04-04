# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Macır frontend with a fresh green theme, fully Turkish UI, and improved UX for daily greengrocer workflows — specifically a product-card-grid sales view and a pre-filled weekly restock list.

**Architecture:** All changes are pure frontend — no API modifications. The existing React Query + Axios data layer is kept intact. Each page is rewritten in-place; no new files are introduced.

**Tech Stack:** React 19, TypeScript, Mantine 8, TanStack Query 5, React Router 6, Recharts, Tabler Icons

---

## File Map

| File | Change type |
|------|-------------|
| `frontend/src/App.tsx` | Modify — add `createTheme()` with green primary |
| `frontend/src/pages/GroceryRecordSales.tsx` | Major rewrite — product card grid |
| `frontend/src/pages/GroceryAddStock.tsx` | Major rewrite — pre-filled category list |
| `frontend/src/pages/GroceryMain.tsx` | Overhaul — clean launchpad layout |
| `frontend/src/pages/GroceryDashboard.tsx` | Polish — bigger chart, Turkish labels |
| `frontend/src/pages/GroceryProducts.tsx` | Minor — translate + theme |
| `frontend/src/pages/Login.tsx` | Minor — translate + theme |

---

## Task 1: Global Mantine Theme

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add `createTheme` and apply it**

Replace `App.tsx` with:

```tsx
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';

import { api } from './api';
import Login from './pages/Login';

const GroceryMain = lazy(() => import('./pages/GroceryMain'));
const GroceryDashboard = lazy(() => import('./pages/GroceryDashboard'));
const GroceryProducts = lazy(() => import('./pages/GroceryProducts'));
const GroceryAddStock = lazy(() => import('./pages/GroceryAddStock'));
const GroceryRecordSales = lazy(() => import('./pages/GroceryRecordSales'));

const qc = new QueryClient();

const theme = createTheme({
  primaryColor: 'green',
  defaultRadius: 'md',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSizes: { md: '17px' },
  components: {
    Button: {
      defaultProps: { radius: 'md' },
    },
    Paper: {
      defaultProps: { radius: 'md' },
    },
  },
});

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  const checkAuth = () =>
    api.get('/api/auth/status/')
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));

  useEffect(() => { checkAuth(); }, []);

  if (authed === null) return null;

  return (
    <QueryClientProvider client={qc}>
      <MantineProvider theme={theme} defaultColorScheme='light'>
        <Notifications position='top-center' />
        {!authed ? (
          <Login onLogin={() => setAuthed(true)} />
        ) : (
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Yükleniyor...</div>}>
            <Routes>
              <Route path='/' element={<GroceryMain onLogout={() => setAuthed(false)} />} />
              <Route path='/dashboard' element={<GroceryDashboard />} />
              <Route path='/products' element={<GroceryProducts />} />
              <Route path='/stock/new' element={<GroceryAddStock />} />
              <Route path='/sales/new' element={<GroceryRecordSales />} />
              <Route path='*' element={<div style={{ padding: '2rem', textAlign: 'center' }}>Sayfa bulunamadı.</div>} />
            </Routes>
          </Suspense>
        )}
      </MantineProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Verify type check passes**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run build 2>&1 | tail -20
```

Expected: build succeeds or only errors from other files (GroceryMain now expects `onLogout` prop — fix in Task 4).

- [ ] **Step 3: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/App.tsx && git commit -m "feat: apply global green Mantine theme"
```

---

## Task 2: Satış Sayfası — Product Card Grid

**Files:**
- Modify: `frontend/src/pages/GroceryRecordSales.tsx`

- [ ] **Step 1: Rewrite GroceryRecordSales.tsx**

```tsx
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
import { IconArrowLeft, IconCheck, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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

  // Sort products: best sellers first, then alphabetical
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
    if (!modalProduct || parseFloat(modalQty) <= 0) return;
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

  const removeItem = (pk: number) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      delete next[pk];
      return next;
    });
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
            const isLowStock = (product.stock_level ?? 999) <= 2;
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
                {/* Selected checkmark */}
                {isSelected && (
                  <Box
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                    }}
                  >
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

        {/* Search — below grid as fallback */}
        <TextInput
          placeholder='Ürün ara...'
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size='md'
        />

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
```

- [ ] **Step 2: Type check**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit 2>&1 | grep "GroceryRecordSales"
```

Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryRecordSales.tsx && git commit -m "feat: satış sayfası — ürün kart grid tasarımı"
```

---

## Task 3: Stok Ekleme Sayfası — Pre-filled Category List

**Files:**
- Modify: `frontend/src/pages/GroceryAddStock.tsx`

- [ ] **Step 1: Rewrite GroceryAddStock.tsx**

```tsx
import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCalendar } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NumpadInput } from '../components/NumpadInput';
import { api, endpoints } from '../api';

interface Product {
  pk: number;
  name: string;
  unit: string;
  stock_level: number;
  low_stock_threshold: number;
  category_name: string;
}

type LineField = 'quantity' | 'purchase_price';

interface ModalState {
  productPk: number;
  field: LineField;
}

export default function GroceryAddStock() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // lines[productPk] = { quantity: '0', purchase_price: '0' }
  const [lines, setLines] = useState<Record<number, { quantity: string; purchase_price: string }>>({});
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [modalValue, setModalValue] = useState('0');
  const [opened, { open, close }] = useDisclosure(false);

  const today = new Date().toISOString().split('T')[0];

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
  });

  // Group products by category, alphabetical within each group
  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    [...products]
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .forEach((p) => {
        const cat = p.category_name || 'Diğer';
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(p);
      });
    return map;
  }, [products]);

  const openFieldModal = (productPk: number, field: LineField) => {
    const current = lines[productPk]?.[field] ?? '0';
    setModalState({ productPk, field });
    setModalValue(current === '0' ? '0' : current);
    open();
  };

  const confirmModal = () => {
    if (!modalState) return;
    const { productPk, field } = modalState;
    setLines((prev) => ({
      ...prev,
      [productPk]: {
        quantity: prev[productPk]?.quantity ?? '0',
        purchase_price: prev[productPk]?.purchase_price ?? '0',
        [field]: modalValue,
      },
    }));
    close();
  };

  const filledCount = Object.values(lines).filter(
    (l) => parseFloat(l.quantity) > 0
  ).length;

  const saveMutation = useMutation({
    mutationFn: () => {
      const validItems = Object.entries(lines)
        .filter(([, l]) => parseFloat(l.quantity) > 0 && parseFloat(l.purchase_price) > 0)
        .map(([pk, l]) => ({
          product: Number(pk),
          quantity: l.quantity,
          purchase_price: l.purchase_price,
        }));

      if (validItems.length === 0) throw new Error('Geçerli ürün yok');

      return api.post(endpoints.stockEntries, {
        date: today,
        notes: '',
        items: validItems,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-products'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard'] });
      notifications.show({ message: 'Stok girişi kaydedildi!', color: 'green' });
      navigate('/');
    },
    onError: () => {
      notifications.show({ message: 'Kayıt başarısız', color: 'red' });
    },
  });

  const modalProduct = modalState ? products.find((p) => p.pk === modalState.productPk) : null;
  const isQtyField = modalState?.field === 'quantity';

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
            <Title order={4}>Stok Ekle</Title>
          </Group>
          <Group gap='xs'>
            <IconCalendar size={16} color='var(--mantine-color-green-6)' />
            <Text size='sm' c='dimmed'>
              {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </Group>
        </Group>
      </Box>

      {/* Product list grouped by category */}
      <Stack p='md' gap='md' style={{ paddingBottom: 100 }}>
        {Array.from(grouped.entries()).map(([category, catProducts]) => (
          <Stack key={category} gap='xs'>
            <Divider
              label={<Text size='xs' fw={700} tt='uppercase' c='dimmed'>{category}</Text>}
              labelPosition='left'
            />
            {catProducts.map((product) => {
              const line = lines[product.pk];
              const qty = line?.quantity ?? '0';
              const price = line?.purchase_price ?? '0';
              const hasQty = parseFloat(qty) > 0;
              const isLow = product.stock_level <= product.low_stock_threshold;

              return (
                <Paper
                  key={product.pk}
                  withBorder
                  p='sm'
                  style={{
                    border: hasQty ? '2px solid var(--mantine-color-green-5)' : '1px solid #e8f5e9',
                    background: hasQty ? 'var(--mantine-color-green-0)' : 'white',
                  }}
                >
                  <Group justify='space-between' mb='xs'>
                    <Group gap='xs'>
                      <Text fw={600} size='sm'>{product.name}</Text>
                      {isLow && (
                        <Badge size='xs' color='orange' variant='light'>
                          ⚠️ {product.stock_level} {product.unit}
                        </Badge>
                      )}
                      {!isLow && (
                        <Badge size='xs' color='green' variant='light'>
                          {product.stock_level} {product.unit}
                        </Badge>
                      )}
                    </Group>
                  </Group>
                  <Group gap='xs'>
                    <Button
                      variant={hasQty ? 'filled' : 'light'}
                      color='green'
                      size='sm'
                      style={{ flex: 1, minWidth: 0 }}
                      onClick={() => openFieldModal(product.pk, 'quantity')}
                    >
                      <Stack gap={0} align='center'>
                        <Text size='10px' opacity={0.8}>Miktar</Text>
                        <Text size='sm' fw={700}>
                          {hasQty ? `${qty} ${product.unit}` : '—'}
                        </Text>
                      </Stack>
                    </Button>
                    <Button
                      variant={parseFloat(price) > 0 ? 'filled' : 'light'}
                      color='green'
                      size='sm'
                      style={{ flex: 1, minWidth: 0 }}
                      onClick={() => openFieldModal(product.pk, 'purchase_price')}
                    >
                      <Stack gap={0} align='center'>
                        <Text size='10px' opacity={0.8}>Alış Fiyatı</Text>
                        <Text size='sm' fw={700}>
                          {parseFloat(price) > 0 ? `₺${parseFloat(price).toFixed(2)}` : '—'}
                        </Text>
                      </Stack>
                    </Button>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        ))}
      </Stack>

      {/* Sticky footer */}
      <Box
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          background: '#f9faf7',
          borderTop: '1px solid #e8f5e9',
          padding: '12px 16px',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        }}
      >
        <Group justify='space-between' mb='xs'>
          <Text size='sm' c='dimmed'>
            {filledCount > 0 ? `${filledCount} ürün eklendi` : 'Ürün miktarı girin'}
          </Text>
        </Group>
        <Button
          color='green'
          fullWidth
          size='md'
          disabled={filledCount === 0}
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          Kaydet
        </Button>
      </Box>

      {/* NumpadInput Modal */}
      <Modal
        opened={opened}
        onClose={close}
        centered
        size='sm'
        title={
          modalProduct
            ? `${modalProduct.name} — ${isQtyField ? 'Miktar' : 'Alış Fiyatı'}`
            : ''
        }
      >
        <Stack>
          {!isQtyField && (
            <Text size='xs' c='dimmed' ta='center'>₺ cinsinden alış fiyatını girin</Text>
          )}
          {isQtyField && modalProduct && (
            <Text size='xs' c='dimmed' ta='center'>{modalProduct.unit} cinsinden miktarı girin</Text>
          )}
          <NumpadInput value={modalValue} onChange={setModalValue} />
          <Group grow>
            <Button variant='default' onClick={close}>İptal</Button>
            <Button color='green' onClick={confirmModal}>Tamam</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit 2>&1 | grep "GroceryAddStock"
```

Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryAddStock.tsx && git commit -m "feat: stok sayfası — kategori listesi tasarımı"
```

---

## Task 4: Ana Sayfa — Launchpad Cleanup

**Files:**
- Modify: `frontend/src/pages/GroceryMain.tsx`

- [ ] **Step 1: Rewrite GroceryMain.tsx**

Note: `App.tsx` now passes `onLogout` prop. Update GroceryMain to accept it.

```tsx
import {
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconChartBar,
  IconClipboardList,
  IconPackage,
  IconShoppingCart,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';

interface DashboardStats {
  total_sales: number;
  net_profit: number;
  low_stock: { product_id: number }[];
}

export default function GroceryMain({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['grocery-dashboard-today', today],
    queryFn: () =>
      api.get(endpoints.dashboard, { params: { range: 'today', date: today } }).then((r) => r.data),
  });

  const lowStockCount = stats?.low_stock?.length ?? 0;

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
        <Text size='sm' c='dimmed'>{todayLabel}</Text>
      </Group>

      {/* Today's stats */}
      <SimpleGrid cols={2} spacing='sm'>
        <Paper
          withBorder
          p='md'
          style={{ border: '1px solid #e8f5e9', cursor: 'pointer' }}
          onClick={() => navigate('/dashboard')}
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
        >
          <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Kâr</Text>
          <Text size='xl' fw={700} c='green'>
            ₺{stats ? parseFloat(String(stats.net_profit)).toFixed(2) : '0.00'}
          </Text>
        </Paper>
      </SimpleGrid>

      {/* Low stock alert */}
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
        >
          <Group gap='xs'>
            <IconAlertTriangle size={18} color='var(--mantine-color-orange-6)' />
            <Text size='sm' fw={600} c='orange'>
              {lowStockCount} üründe stok azaldı — Stok Ekle
            </Text>
          </Group>
        </Box>
      )}

      {/* Primary action */}
      <Button
        color='green'
        size='xl'
        h={70}
        leftSection={<IconShoppingCart size={26} />}
        onClick={() => navigate('/sales/new')}
        styles={{ inner: { gap: 12 } }}
      >
        <Text size='lg' fw={700}>Satış Yap</Text>
      </Button>

      {/* Secondary action */}
      <Button
        variant='light'
        color='green'
        size='lg'
        h={56}
        leftSection={<IconPackage size={22} />}
        onClick={() => navigate('/stock/new')}
        styles={{ inner: { gap: 12 } }}
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
        >
          Ürünler
        </Button>
        <Button
          variant='default'
          h={56}
          leftSection={<IconChartBar size={20} />}
          onClick={() => navigate('/dashboard')}
        >
          Raporlar
        </Button>
      </SimpleGrid>

      <Box style={{ flex: 1 }} />

      {/* Logout */}
      <Button variant='subtle' color='gray' size='sm' onClick={handleLogout}>
        Çıkış Yap
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 2: Type check**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit 2>&1 | grep -E "GroceryMain|App"
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryMain.tsx && git commit -m "feat: ana sayfa — launchpad düzeni"
```

---

## Task 5: Raporlar Sayfası — Visual Polish

**Files:**
- Modify: `frontend/src/pages/GroceryDashboard.tsx`

- [ ] **Step 1: Rewrite GroceryDashboard.tsx**

```tsx
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

function trDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]}`;
}

export default function GroceryDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<'today' | 'week' | 'month'>('week');
  const today = new Date().toISOString().split('T')[0];

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
          <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }}>
            <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Satış</Text>
            <Text size='xl' fw={700} c='green'>₺{fmt2(data?.total_sales)}</Text>
          </Paper>
          <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }}>
            <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Kâr</Text>
            <Text size='xl' fw={700} c='green'>₺{fmt2(data?.net_profit)}</Text>
          </Paper>
        </SimpleGrid>
        <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }}>
          <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Satılan Ürün Adedi</Text>
          <Text size='xl' fw={700} c='green'>{data?.items_sold ?? 0}</Text>
        </Paper>

        {/* 7-day chart */}
        <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }}>
          <Text fw={700} mb='md'>7 Günlük Satış</Text>
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
        <Paper withBorder p='md' style={{ border: '1px solid #e8f5e9' }}>
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
```

- [ ] **Step 2: Type check**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit 2>&1 | grep "GroceryDashboard"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryDashboard.tsx && git commit -m "feat: raporlar sayfası — büyük grafik ve Türkçe etiketler"
```

---

## Task 6: Ürünler ve Giriş — Türkçe + Tema

**Files:**
- Modify: `frontend/src/pages/GroceryProducts.tsx`
- Modify: `frontend/src/pages/Login.tsx`

- [ ] **Step 1: Update GroceryProducts.tsx — Turkish labels and navigation header**

Replace the file content with:

```tsx
import {
  Box,
  Button,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconEdit, IconPlus, IconSearch, IconUpload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, endpoints } from '../api';

interface Category {
  pk: number;
  name: string;
}

interface Product {
  pk: number;
  name: string;
  category: number | null;
  category_name: string;
  unit: string;
  sell_price: string;
  low_stock_threshold: string;
  expiry_note: string;
  is_active: boolean;
}

export default function GroceryProducts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products-all'],
    queryFn: () =>
      api.get(endpoints.products, { params: { active: 'false' } }).then((r) => r.data),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['grocery-categories'],
    queryFn: () => api.get(endpoints.categories).then((r) => r.data),
  });

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    return products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search]);

  const form = useForm({
    initialValues: {
      name: '',
      category: null as number | null,
      unit: 'kg',
      sell_price: 0,
      low_stock_threshold: 0,
      expiry_note: '',
    },
  });

  const openEdit = (product: Product) => {
    setEditing(product);
    setIconFile(null);
    form.setValues({
      name: product.name,
      category: product.category,
      unit: product.unit,
      sell_price: parseFloat(product.sell_price),
      low_stock_threshold: parseFloat(product.low_stock_threshold),
      expiry_note: product.expiry_note,
    });
    open();
  };

  const openNew = () => {
    setEditing(null);
    setIconFile(null);
    form.reset();
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values: typeof form.values) => {
      const formData = new FormData();
      formData.append('name', values.name);
      if (values.category != null) formData.append('category', String(values.category));
      formData.append('unit', values.unit);
      formData.append('sell_price', values.sell_price.toFixed(2));
      formData.append('low_stock_threshold', values.low_stock_threshold.toFixed(2));
      formData.append('expiry_note', values.expiry_note);
      if (iconFile) formData.append('svg_icon', iconFile);

      if (editing) {
        return api.patch(`${endpoints.products}${editing.pk}/`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      return api.post(endpoints.products, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-products-all'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-products'] });
      notifications.show({
        message: editing ? 'Ürün güncellendi' : 'Ürün eklendi',
        color: 'green',
      });
      close();
    },
    onError: () => {
      notifications.show({
        message: editing ? 'Güncelleme başarısız' : 'Ürün eklenemedi',
        color: 'red',
      });
    },
  });

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
            <Title order={4}>Ürünler</Title>
          </Group>
          <Button leftSection={<IconPlus size={16} />} onClick={openNew} size='sm' color='green'>
            Ürün Ekle
          </Button>
        </Group>
      </Box>

      <Stack p='md' gap='sm'>
        <TextInput
          placeholder='Ürün ara...'
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />

        {filteredProducts.map((product) => (
          <Paper key={product.pk} withBorder p='sm' style={{ border: '1px solid #e8f5e9' }}>
            <Group justify='space-between'>
              <div>
                <Text fw={600} c={product.is_active ? undefined : 'dimmed'}>
                  {product.name} {!product.is_active && '(pasif)'}
                </Text>
                <Text size='xs' c='dimmed'>
                  {product.category_name} · ₺{product.sell_price}/{product.unit}
                </Text>
              </div>
              <Button
                variant='subtle'
                color='green'
                size='xs'
                leftSection={<IconEdit size={14} />}
                onClick={() => openEdit(product)}
              >
                Düzenle
              </Button>
            </Group>
          </Paper>
        ))}
      </Stack>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? 'Ürünü Düzenle' : 'Yeni Ürün'}
      >
        <form onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}>
          <Stack>
            <TextInput label='Ad' required {...form.getInputProps('name')} />
            <Select
              label='Kategori'
              data={categories.map((c) => ({ value: String(c.pk), label: c.name }))}
              value={form.values.category ? String(form.values.category) : null}
              onChange={(v) => form.setFieldValue('category', v ? Number(v) : null)}
            />
            <Select
              label='Birim'
              data={[{ value: 'kg', label: 'kg' }, { value: 'piece', label: 'adet' }]}
              {...form.getInputProps('unit')}
            />
            <NumberInput
              label='Satış Fiyatı'
              prefix='₺'
              decimalScale={2}
              {...form.getInputProps('sell_price')}
            />
            <NumberInput
              label='Stok Uyarı Eşiği'
              decimalScale={2}
              {...form.getInputProps('low_stock_threshold')}
            />
            <TextInput label='Son Kullanma Notu' {...form.getInputProps('expiry_note')} />
            <FileInput
              label='İkon (SVG veya resim)'
              placeholder='Dosya seç...'
              leftSection={<IconUpload size={14} />}
              value={iconFile}
              onChange={setIconFile}
              accept='image/svg+xml,image/*'
              clearable
            />
            <Group grow>
              <Button variant='default' onClick={close}>İptal</Button>
              <Button type='submit' color='green' loading={saveMutation.isPending}>Kaydet</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
```

- [ ] **Step 2: Update Login.tsx — Turkish labels and green theme**

```tsx
import { Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [loading, setLoading] = useState(false);
  const form = useForm({ initialValues: { username: '', password: '' } });

  const submit = async (values: typeof form.values) => {
    setLoading(true);
    try {
      await api.get('/api/auth/csrf/');
      await api.post('/api/auth/login/', values);
      onLogin();
    } catch {
      notifications.show({ message: 'Kullanıcı adı veya şifre hatalı', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Center h='100vh' style={{ background: '#f9faf7' }}>
      <Paper withBorder p='xl' w={320} style={{ border: '1px solid #e8f5e9' }}>
        <Stack>
          <Title order={3} ta='center' c='green'>🌿 Macır</Title>
          <Text size='sm' c='dimmed' ta='center'>Hoş geldiniz</Text>
          <form onSubmit={form.onSubmit(submit)}>
            <Stack>
              <TextInput label='Kullanıcı Adı' required {...form.getInputProps('username')} />
              <PasswordInput label='Şifre' required {...form.getInputProps('password')} />
              <Button type='submit' color='green' loading={loading}>Giriş Yap</Button>
            </Stack>
          </form>
        </Stack>
      </Paper>
    </Center>
  );
}
```

- [ ] **Step 3: Full type check**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit 2>&1
```

Expected: no type errors across all files.

- [ ] **Step 4: Build verification**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run build 2>&1 | tail -10
```

Expected: `✓ built in Xs` with no errors.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryProducts.tsx frontend/src/pages/Login.tsx && git commit -m "feat: ürünler ve giriş sayfası — Türkçe ve yeşil tema"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Green primaryColor theme | Task 1 |
| Off-white background #f9faf7 | Tasks 2–6 (inline style on root Stack/Box) |
| 17px font size | Task 1 (createTheme fontSizes) |
| 48px tap targets | Tasks 2–6 (Button size='md'/'lg'/'xl', Paper h≥48) |
| Sticky headers on all pages | Tasks 2–6 |
| Sticky footer for actions | Tasks 2, 3 |
| Fully Turkish UI | Tasks 2–6 |
| Sales: 3-col product card grid | Task 2 |
| Sales: sorted by best-seller | Task 2 (sortedProducts memo) |
| Sales: low stock orange dot | Task 2 |
| Sales: selected card green border + badge | Task 2 |
| Sales: search below grid | Task 2 |
| Sales: category chips | Task 2 |
| Sales: sticky footer with total | Task 2 |
| Sales: removed popular/recent papers | Task 2 |
| Stock: pre-filled full product list | Task 3 |
| Stock: grouped by category | Task 3 |
| Stock: low stock orange badge | Task 3 |
| Stock: NumpadInput modal for qty/price | Task 3 |
| Stock: filled rows green highlight | Task 3 |
| Stock: sticky save footer | Task 3 |
| Home: 2-col stat cards | Task 4 |
| Home: low stock alert bar | Task 4 |
| Home: primary Satış Yap button | Task 4 |
| Home: secondary Stok Ekle button | Task 4 |
| Home: half-width Ürünler/Raporlar | Task 4 |
| Home: Çıkış Yap link | Task 4 |
| Dashboard: bigger chart (320px) | Task 5 |
| Dashboard: Turkish date labels | Task 5 (trDate helper) |
| Dashboard: card-based stats | Task 5 |
| Dashboard: Turkish section headers | Task 5 |
| Dashboard: conditional low stock | Task 5 |
| Products: Turkish labels | Task 6 |
| Products: green theme | Task 6 |
| Login: Turkish labels | Task 6 |
| Login: green theme | Task 6 |

All spec requirements covered. No placeholders, TBDs, or incomplete sections. Type names and prop names are consistent across tasks (`onLogout` defined in Task 1 App.tsx, consumed in Task 4 GroceryMain).
