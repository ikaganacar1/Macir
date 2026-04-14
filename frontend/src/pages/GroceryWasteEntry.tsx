import {
  Badge,
  Box,
  Button,
  Group,
  Image,
  Modal,
  Paper,
  Select,
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

interface WasteItemDraft {
  product: number;
  quantity: string;
  reason: string;
}

const REASON_OPTIONS = [
  { value: 'spoiled', label: 'Bozuldu' },
  { value: 'damaged', label: 'Hasarlı' },
  { value: 'expired', label: 'Son kullanma tarihi geçti' },
  { value: 'other', label: 'Diğer' },
];

export default function GroceryWasteEntry() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedItems, setSelectedItems] = useState<Record<number, WasteItemDraft>>({});
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalQty, setModalQty] = useState('0');
  const [modalReason, setModalReason] = useState('spoiled');
  const [opened, { open, close }] = useDisclosure(false);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['grocery-products'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
  });

  const openModal = (product: Product) => {
    setModalProduct(product);
    setModalQty(selectedItems[product.pk]?.quantity ?? '0');
    setModalReason(selectedItems[product.pk]?.reason ?? 'spoiled');
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
        reason: modalReason,
      },
    }));
    close();
  };

  const selectedCount = Object.keys(selectedItems).length;

  const saveMutation = useMutation({
    mutationFn: () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
      return api.post(endpoints.wasteEntries, {
        date: today,
        notes: '',
        items: Object.values(selectedItems),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grocery-products'] });
      notifications.show({ message: 'Fire/kayıp kaydedildi!', color: 'green' });
      navigate('/');
    },
    onError: () => {
      notifications.show({ message: 'Kaydedilemedi', color: 'red' });
    },
  });

  return (
    <PageLayout
      header={
        <Group justify='space-between'>
          <Group gap='xs'>
            <Button variant='subtle' color='gray' px='xs' onClick={() => navigate(-1)}>
              <IconArrowLeft size={20} />
            </Button>
            <Title order={4}>Fire/Kayıp Kaydı</Title>
          </Group>
          {selectedCount > 0 && (
            <Badge size='lg' color='orange'>{selectedCount} ürün</Badge>
          )}
        </Group>
      }
      footer={selectedCount > 0 ? (
        <Box
          style={{
            background: 'var(--mantine-color-orange-6)',
            padding: '12px 16px',
          }}
        >
          <Button
            color='white'
            variant='white'
            c='orange'
            size='md'
            fullWidth
            onClick={() => saveMutation.mutate()}
            loading={saveMutation.isPending}
          >
            Kaydet ({selectedCount} ürün)
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
                border: isSelected ? '2px solid var(--mantine-color-orange-6)' : '1px solid #e8f5e9',
                background: isSelected ? 'var(--mantine-color-orange-0)' : 'white',
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
                  <Badge size='xs' color='orange' variant='filled'>
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
              <Text size='xs' c='orange'>Stok: {product.stock_level}</Text>
            </Paper>
          );
        })}
      </SimpleGrid>

      <Modal opened={opened} onClose={close} title={modalProduct?.name} centered size='sm'>
        {modalProduct && (
          <Stack>
            <Group justify='center'>
              <Box ta='center'>
                <Text size='xs' c='dimmed'>Mevcut Stok</Text>
                <Text fw={700} c='orange'>
                  {modalProduct.stock_level} {modalProduct.unit}
                </Text>
              </Box>
            </Group>

            <Select
              label='Neden'
              data={REASON_OPTIONS}
              value={modalReason}
              onChange={(v) => setModalReason(v ?? 'spoiled')}
            />

            <Text size='xs' fw={700} ta='center'>Miktar</Text>
            <NumpadInput value={modalQty} onChange={setModalQty} />

            <Group grow mt='md'>
              <Button variant='default' onClick={close}>İptal</Button>
              <Button
                color='orange'
                onClick={confirmItem}
                disabled={parseFloat(modalQty) <= 0}
              >
                Ekle
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </PageLayout>
  );
}
