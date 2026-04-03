import { t } from '../i18n';
import {
  Badge,
  Box,
  Button,
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
import { IconSearch } from '@tabler/icons-react';
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
}

interface SaleItem {
  product: number;
  quantity: string;
  sell_price: string;
}

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
    queryFn: () =>
      api.get(endpoints.products).then((r) => r.data),
  });

  const categories = useMemo(() => {
    const cats = [...new Set(products.map((p) => p.category_name).filter(Boolean))];
    return ['all', ...cats];
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat =
        activeCategory === 'all' || p.category_name === activeCategory;
      return matchSearch && matchCat;
    });
  }, [products, search, activeCategory]);

  const openModal = (product: Product) => {
    setModalProduct(product);
    setModalQty('0');
    setModalPrice(parseFloat(product.sell_price));
    open();
  };

  const confirmItem = () => {
    if (!modalProduct) return;
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
      notifications.show({ message: t`Sale saved`, color: 'green' });
      navigate('/');
    },
    onError: () => {
      notifications.show({ message: t`Failed to save sale. Please try again.`, color: 'red' });
    },
  });

  return (
    <Stack p='md' gap='sm'>
      <Title order={4}>📋 {t`Record Sales`}</Title>

      <TextInput
        placeholder={t`Search product...`}
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />

      <ScrollArea>
        <Group gap='xs' wrap='nowrap' pb='xs'>
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant={activeCategory === cat ? 'filled' : 'outline'}
              color='green'
              style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => setActiveCategory(cat)}
            >
              {cat === 'all' ? t`All` : cat}
            </Badge>
          ))}
        </Group>
      </ScrollArea>

      <SimpleGrid cols={3} spacing='sm'>
        {filtered.map((product) => {
          const selected = selectedItems[product.pk];
          return (
            <Paper
              key={product.pk}
              withBorder
              p='xs'
              ta='center'
              style={{
                cursor: 'pointer',
                borderColor: selected
                  ? 'var(--mantine-color-green-6)'
                  : undefined,
                borderWidth: selected ? 2 : 1,
                background: selected
                  ? 'var(--mantine-color-green-0)'
                  : undefined,
                position: 'relative',
              }}
              onClick={() => openModal(product)}
            >
              {selected && (
                <Badge
                  color='green'
                  size='xs'
                  style={{ position: 'absolute', top: -6, right: -6 }}
                >
                  ✓
                </Badge>
              )}
              {product.svg_icon ? (
                <Image src={product.svg_icon} h={36} w={36} mx='auto' mb={4} />
              ) : (
                <Box h={36} mb={4} />
              )}
              <Text size='xs' fw={600} c={selected ? 'green' : undefined} lineClamp={1}>
                {product.name}
              </Text>
              <Text size='xs' c='dimmed'>
                {selected
                  ? `${selected.quantity} ${product.unit} ✓`
                  : `₺${product.sell_price}/${product.unit}`}
              </Text>
            </Paper>
          );
        })}
      </SimpleGrid>

      {Object.keys(selectedItems).length > 0 && (
        <Paper
          withBorder
          p='sm'
          style={{ background: 'var(--mantine-color-green-6)', position: 'sticky', bottom: 0 }}
        >
          <Group justify='space-between'>
            <Text c='white' size='sm'>
              {Object.keys(selectedItems).length} {t`items`} · ₺{totalRevenue.toFixed(2)}
            </Text>
            <Button
              color='white'
              variant='white'
              c='green'
              size='xs'
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
            >
              {t`Save`} →
            </Button>
          </Group>
        </Paper>
      )}

      {/* Quantity + price modal */}
      <Modal
        opened={opened}
        onClose={close}
        title={modalProduct?.name}
        centered
      >
        {modalProduct && (
          <Stack>
            <Text size='xs' c='dimmed'>
              {t`Unit`}: {modalProduct.unit}
            </Text>
            <NumberInput
              label={t`Sell price (₺)`}
              value={modalPrice}
              onChange={(v) => setModalPrice(Number(v) || 0)}
              min={0}
              decimalScale={2}
              prefix='₺'
              size='sm'
            />
            <Text size='sm' fw={600}>{t`Quantity`}</Text>
            <NumpadInput value={modalQty} onChange={setModalQty} />
            <Group grow>
              <Button variant='default' onClick={close}>
                {t`Cancel`}
              </Button>
              <Button
                color='green'
                onClick={confirmItem}
                disabled={modalQty === '0'}
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
