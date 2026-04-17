import {
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Image,
  Modal,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NumpadInput } from '../components/NumpadInput';
import PageLayout from '../components/PageLayout';
import { api, endpoints } from '../api';
import type { Product } from '../types';
import { getIstanbulToday } from '../utils/format';

interface ReturnItemDraft {
  product: number;
  quantity: string;
  refund_price: string;
}

export default function GroceryReturns() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedItems, setSelectedItems] = useState<Record<number, ReturnItemDraft>>({});
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalQty, setModalQty] = useState('0');
  const [modalPrice, setModalPrice] = useState(0);
  const [opened, { open, close }] = useDisclosure(false);
  const [confirmOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
  });

  const openModal = (product: Product) => {
    setModalProduct(product);
    setModalQty(selectedItems[product.pk]?.quantity ?? '0');
    setModalPrice(parseFloat(selectedItems[product.pk]?.refund_price ?? product.sell_price));
    open();
  };

  const confirmItem = () => {
    if (!modalProduct) return;
    if (!modalQty || parseFloat(modalQty) <= 0) {
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
        refund_price: modalPrice.toFixed(2),
      },
    }));
    close();
  };

  const selectedCount = Object.keys(selectedItems).length;

  const totalRefund = Object.values(selectedItems).reduce((sum, item) => {
    const qtyCents = Math.round(parseFloat(item.quantity) * 1000);
    const priceCents = Math.round(parseFloat(item.refund_price) * 100);
    return sum + qtyCents * priceCents;
  }, 0) / 100000;

  const saveMutation = useMutation({
    mutationFn: () => {
      const today = getIstanbulToday();
      return api.post(endpoints.returnRecords, {
        date: today,
        notes: '',
        items: Object.values(selectedItems),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grocery-products'] });
      notifications.show({ message: 'İade kaydedildi!', color: 'green' });
      navigate('/');
    },
    onError: () => {
      notifications.show({ message: 'İade kaydedilemedi', color: 'red' });
    },
  });

  return (
    <PageLayout
      header={
        <Group justify='space-between'>
          <Group gap='xs'>
            <Button variant='subtle' color='gray' px='xs' onClick={() => navigate(-1)} aria-label='Geri dön'>
              <IconArrowLeft size={20} />
            </Button>
            <Title order={4}>İade Al</Title>
          </Group>
          {selectedCount > 0 && (
            <Badge size='lg' color='blue'>{selectedCount} ürün</Badge>
          )}
        </Group>
      }
      footer={selectedCount > 0 ? (
        <Box
          style={{
            background: 'var(--mantine-color-blue-6)',
            padding: '12px 16px',
          }}
        >
          <Group justify='space-between' mb='xs'>
            <Text c='white' fw={700} size='lg'>
              Toplam İade: ₺{totalRefund.toFixed(2)}
            </Text>
          </Group>
          <Button
            color='white'
            variant='white'
            c='blue'
            size='md'
            fullWidth
            onClick={openConfirm}
            loading={saveMutation.isPending}
          >
            Kaydet →
          </Button>
        </Box>
      ) : undefined}
    >
      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing='sm'>
        {products.map((product) => {
          const isSelected = !!selectedItems[product.pk];
          return (
            <Paper
              key={product.pk}
              withBorder
              p='sm'
              style={{
                cursor: 'pointer',
                position: 'relative',
                border: isSelected ? '2px solid var(--mantine-color-blue-6)' : '1px solid #e8f5e9',
                background: isSelected ? 'var(--mantine-color-blue-0)' : 'white',
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
              {isSelected && (
                <Box style={{ position: 'absolute', top: 4, left: 4 }}>
                  <Badge size='xs' color='blue' variant='filled'>
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

      <Modal
        opened={confirmOpen}
        onClose={closeConfirm}
        title='Kayıt onayı'
        centered
        size='sm'
      >
        <Stack gap='md'>
          <Text size='sm'>{selectedCount} ürün kaydedilecek. Devam edilsin mi?</Text>
          <Group justify='flex-end'>
            <Button variant='default' onClick={closeConfirm}>İptal</Button>
            <Button
              color='blue'
              loading={saveMutation.isPending}
              onClick={() => { closeConfirm(); saveMutation.mutate(); }}
              data-testid='btn-confirm-save'
            >
              Kaydet
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={opened} onClose={close} title={modalProduct?.name} centered size='sm'>
        {modalProduct && (
          <Stack>
            <Group justify='center'>
              <Box ta='center'>
                <Text size='xs' c='dimmed'>İade Fiyatı</Text>
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
            </Group>

            <Divider />

            <Text size='xs' fw={700} ta='center'>Miktar</Text>
            <NumpadInput value={modalQty} onChange={setModalQty} integerOnly={modalProduct.unit === 'piece'} />

            <Group grow mt='md'>
              <Button variant='default' onClick={close}>İptal</Button>
              <Button
                color='blue'
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
