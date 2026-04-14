import {
  Box,
  Button,
  Divider,
  Group,
  NumberInput,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PageLayout from '../components/PageLayout';
import { api, endpoints } from '../api';
import type { Product } from '../types';

export default function GroceryPriceEditor() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [changedPrices, setChangedPrices] = useState<Record<number, string>>({});

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['grocery-products-all'],
    queryFn: () => api.get(endpoints.products).then((r) => r.data),
  });

  const { grouped, sortedCategories } = useMemo(() => {
    const order: Record<string, number> = {};
    const map: Record<string, Product[]> = {};
    let idx = 0;
    for (const p of products) {
      const cat = p.category_name || 'Diğer';
      if (!(cat in order)) {
        order[cat] = idx++;
      }
      if (!map[cat]) map[cat] = [];
      map[cat].push(p);
    }
    const sorted = Object.keys(map).sort((a, b) => (order[a] ?? 0) - (order[b] ?? 0));
    return { grouped: map, sortedCategories: sorted };
  }, [products]);

  const hasChanges = Object.keys(changedPrices).length > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const patches = Object.entries(changedPrices).map(([pk, price]) =>
        api.patch(`${endpoints.products}${pk}/`, {
          sell_price: parseFloat(price).toFixed(2),
        })
      );
      await Promise.all(patches);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grocery-products'] });
      qc.invalidateQueries({ queryKey: ['grocery-products-all'] });
      setChangedPrices({});
      notifications.show({ message: 'Fiyatlar güncellendi!', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Fiyat güncellenemedi — lütfen tekrar deneyin', color: 'red' });
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
            <Title order={4}>Fiyat Düzenle</Title>
          </Group>
          <Group gap='xs'>
            {hasChanges && (
              <Button
                variant='default'
                size='sm'
                onClick={() => setChangedPrices({})}
                data-testid='btn-revert'
              >
                Geri Al
              </Button>
            )}
            <Button
              color='green'
              size='sm'
              disabled={!hasChanges}
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Değişiklikleri Kaydet
            </Button>
          </Group>
        </Group>
      }
    >
      {isLoading && <Text c='dimmed'>Yükleniyor...</Text>}
      {sortedCategories.map((categoryName) => {
        const categoryProducts = grouped[categoryName];
        return (
        <Box key={categoryName}>
          <Text fw={700} size='sm' c='dimmed' mb='xs' tt='uppercase'>
            {categoryName}
          </Text>
          <Stack gap='xs'>
            {categoryProducts.map((product, idx) => {
              const isChanged = product.pk in changedPrices;
              const displayPrice = isChanged
                ? parseFloat(changedPrices[product.pk])
                : parseFloat(product.sell_price);
              return (
                <Box key={product.pk}>
                  <Group justify='space-between' align='center' py='xs'>
                    <Text
                      fw={isChanged ? 700 : 400}
                      c={isChanged ? 'green' : undefined}
                      style={{ flex: 1 }}
                    >
                      {product.name}
                      <Text span size='xs' c='dimmed' ml={4}>{product.unit}</Text>
                    </Text>
                    <NumberInput
                      value={displayPrice}
                      onChange={(v) => {
                        const newVal = Number(v ?? 0);
                        const origVal = parseFloat(product.sell_price);
                        if (Math.abs(newVal - origVal) < 0.001) {
                          setChangedPrices((prev) => {
                            const next = { ...prev };
                            delete next[product.pk];
                            return next;
                          });
                        } else {
                          setChangedPrices((prev) => ({
                            ...prev,
                            [product.pk]: String(newVal),
                          }));
                        }
                      }}
                      min={0}
                      decimalScale={2}
                      prefix='₺'
                      size='sm'
                      w={100}
                      styles={{
                        input: {
                          borderColor: isChanged ? 'var(--mantine-color-green-6)' : undefined,
                          fontWeight: isChanged ? 700 : undefined,
                        },
                      }}
                    />
                  </Group>
                  {idx < categoryProducts.length - 1 && <Divider />}
                </Box>
              );
            })}
          </Stack>
        </Box>
        );
      })}
    </PageLayout>
  );
}
