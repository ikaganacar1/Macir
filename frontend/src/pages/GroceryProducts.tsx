import { t } from '../i18n';
import {
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
import { IconEdit, IconPlus, IconSearch, IconUpload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

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
  
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);

  // Fetch all products including inactive (management view)
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
    return products.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );
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
        message: editing ? t`Product updated` : t`Product created`,
        color: 'green',
      });
      close();
    },
    onError: () => {
      notifications.show({
        message: editing ? t`Failed to update product.` : t`Failed to create product.`,
        color: 'red',
      });
    },
  });

  return (
    <Stack p='md' gap='sm'>
      <Group justify='space-between'>
        <Title order={4}>📋 {t`Products`}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openNew} size='sm'>
          {t`Add Product`}
        </Button>
      </Group>

      <TextInput
        placeholder={t`Search products...`}
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />

      {filteredProducts.map((product) => (
        <Paper key={product.pk} withBorder p='sm'>
          <Group justify='space-between'>
            <div>
              <Text fw={600} c={product.is_active ? undefined : 'dimmed'}>
                {product.name} {!product.is_active && `(${t`inactive`})`}
              </Text>
              <Text size='xs' c='dimmed'>
                {product.category_name} · ₺{product.sell_price}/{product.unit}
              </Text>
            </div>
            <Button
              variant='subtle'
              size='xs'
              leftSection={<IconEdit size={14} />}
              onClick={() => openEdit(product)}
            >
              {t`Edit`}
            </Button>
          </Group>
        </Paper>
      ))}

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? t`Edit Product` : t`Add Product`}
      >
        <form onSubmit={form.onSubmit((values) => saveMutation.mutate(values))}>
          <Stack>
            <TextInput label={t`Name`} required {...form.getInputProps('name')} />
            <Select
              label={t`Category`}
              data={categories.map((c) => ({ value: String(c.pk), label: c.name }))}
              value={form.values.category ? String(form.values.category) : null}
              onChange={(v) => form.setFieldValue('category', v ? Number(v) : null)}
            />
            <Select
              label={t`Unit`}
              data={[{ value: 'kg', label: 'kg' }, { value: 'piece', label: t`piece` }]}
              {...form.getInputProps('unit')}
            />
            <NumberInput
              label={t`Sell Price`}
              prefix='₺'
              decimalScale={2}
              {...form.getInputProps('sell_price')}
            />
            <NumberInput
              label={t`Low Stock Alert Threshold`}
              decimalScale={2}
              {...form.getInputProps('low_stock_threshold')}
            />
            <TextInput label={t`Expiry Note`} {...form.getInputProps('expiry_note')} />
            <FileInput
              label={t`Icon (SVG or image)`}
              placeholder={t`Choose file...`}
              leftSection={<IconUpload size={14} />}
              value={iconFile}
              onChange={setIconFile}
              accept='image/svg+xml,image/*'
              clearable
            />
            <Group grow>
              <Button variant='default' onClick={close}>{t`Cancel`}</Button>
              <Button type='submit' loading={saveMutation.isPending}>{t`Save`}</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
