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
import PageLayout from '../components/PageLayout';
import { api, endpoints } from '../api';
import type { Product } from '../types';

type LineField = 'quantity' | 'purchase_price';

interface ModalState {
  productPk: number;
  field: LineField;
}

export default function GroceryAddStock() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [lines, setLines] = useState<Record<number, { quantity: string; purchase_price: string }>>({});
  const [modalState, setModalState] = useState<ModalState | null>(null);
  const [modalValue, setModalValue] = useState('0');
  const [opened, { open, close }] = useDisclosure(false);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());

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
    setModalValue(current);
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
    (l) => parseFloat(l.quantity) > 0 && parseFloat(l.purchase_price) > 0
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
      notifications.show({ message: 'Stok girişi kaydedilemedi', color: 'red' });
    },
  });

  const modalProduct = modalState ? products.find((p) => p.pk === modalState.productPk) : null;
  const isQtyField = modalState?.field === 'quantity';

  return (
    <PageLayout
      header={
        <Group justify='space-between'>
          <Group gap='xs'>
            <Button variant='subtle' color='gray' px='xs' onClick={() => navigate(-1)}>
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
      }
      footer={
        <Box
          style={{
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
            data-testid="save-button"
          >
            Kaydet
          </Button>
        </Box>
      }
    >
      {/* Product list grouped by category */}
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
            const isLow = product.stock_level <= parseFloat(String(product.low_stock_threshold));

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
                    {isLow ? (
                      <Badge size='xs' color='orange' variant='light' data-testid={`low-stock-${product.pk}`}>
                        ⚠️ {product.stock_level} {product.unit}
                      </Badge>
                    ) : (
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
                    data-testid={`qty-btn-${product.pk}`}
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
                    data-testid={`price-btn-${product.pk}`}
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
            <Button color='green' onClick={confirmModal} data-testid="confirm-modal-btn">Tamam</Button>
          </Group>
        </Stack>
      </Modal>
    </PageLayout>
  );
}
