import {
  Box,
  Button,
  FileInput,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
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
import type { Category, Product } from '../types';

interface Preset {
  name: string;
  emoji: string;
  unit: 'kg' | 'piece';
  category: 'Sebze' | 'Meyve' | 'Diğer';
}

const PRESET_PRODUCTS: Preset[] = [
  // Sebze
  { name: 'Domates', emoji: '🍅', unit: 'kg', category: 'Sebze' },
  { name: 'Salatalık', emoji: '🥒', unit: 'kg', category: 'Sebze' },
  { name: 'Kırmızı Biber', emoji: '🫑', unit: 'kg', category: 'Sebze' },
  { name: 'Sivri Biber', emoji: '🫑', unit: 'kg', category: 'Sebze' },
  { name: 'Dolmalık Biber', emoji: '🫑', unit: 'kg', category: 'Sebze' },
  { name: 'Acı Biber', emoji: '🌶️', unit: 'kg', category: 'Sebze' },
  { name: 'Patlıcan', emoji: '🍆', unit: 'kg', category: 'Sebze' },
  { name: 'Havuç', emoji: '🥕', unit: 'kg', category: 'Sebze' },
  { name: 'Patates', emoji: '🥔', unit: 'kg', category: 'Sebze' },
  { name: 'Tatlı Patates', emoji: '🍠', unit: 'kg', category: 'Sebze' },
  { name: 'Soğan', emoji: '🧅', unit: 'kg', category: 'Sebze' },
  { name: 'Taze Soğan', emoji: '🌱', unit: 'kg', category: 'Sebze' },
  { name: 'Sarımsak', emoji: '🧄', unit: 'kg', category: 'Sebze' },
  { name: 'Ispanak', emoji: '🥬', unit: 'kg', category: 'Sebze' },
  { name: 'Marul', emoji: '🥗', unit: 'kg', category: 'Sebze' },
  { name: 'Buz Marul', emoji: '🥬', unit: 'kg', category: 'Sebze' },
  { name: 'Roka', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Tere', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Semizotu', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Maydanoz', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Dereotu', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Nane', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Kabak', emoji: '🫛', unit: 'kg', category: 'Sebze' },
  { name: 'Pırasa', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Kereviz', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Brokoli', emoji: '🥦', unit: 'kg', category: 'Sebze' },
  { name: 'Karnabahar', emoji: '🥦', unit: 'kg', category: 'Sebze' },
  { name: 'Lahana', emoji: '🥬', unit: 'kg', category: 'Sebze' },
  { name: 'Kırmızı Lahana', emoji: '🥬', unit: 'kg', category: 'Sebze' },
  { name: 'Fasulye', emoji: '🫘', unit: 'kg', category: 'Sebze' },
  { name: 'Barbunya', emoji: '🫘', unit: 'kg', category: 'Sebze' },
  { name: 'Börülce', emoji: '🫘', unit: 'kg', category: 'Sebze' },
  { name: 'Bezelye', emoji: '🫛', unit: 'kg', category: 'Sebze' },
  { name: 'Bamya', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Pancar', emoji: '🟣', unit: 'kg', category: 'Sebze' },
  { name: 'Turp', emoji: '🌰', unit: 'kg', category: 'Sebze' },
  { name: 'Enginar', emoji: '🌸', unit: 'kg', category: 'Sebze' },
  { name: 'Kuşkonmaz', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Rezene', emoji: '🌿', unit: 'kg', category: 'Sebze' },
  { name: 'Zencefil', emoji: '🫚', unit: 'kg', category: 'Sebze' },
  { name: 'Asma Yaprağı', emoji: '🍃', unit: 'kg', category: 'Sebze' },
  // Meyve
  { name: 'Elma', emoji: '🍎', unit: 'kg', category: 'Meyve' },
  { name: 'Armut', emoji: '🍐', unit: 'kg', category: 'Meyve' },
  { name: 'Portakal', emoji: '🍊', unit: 'kg', category: 'Meyve' },
  { name: 'Mandalina', emoji: '🍊', unit: 'kg', category: 'Meyve' },
  { name: 'Greyfurt', emoji: '🍊', unit: 'kg', category: 'Meyve' },
  { name: 'Limon', emoji: '🍋', unit: 'kg', category: 'Meyve' },
  { name: 'Muz', emoji: '🍌', unit: 'kg', category: 'Meyve' },
  { name: 'Üzüm', emoji: '🍇', unit: 'kg', category: 'Meyve' },
  { name: 'Çilek', emoji: '🍓', unit: 'kg', category: 'Meyve' },
  { name: 'Kiraz', emoji: '🍒', unit: 'kg', category: 'Meyve' },
  { name: 'Vişne', emoji: '🍒', unit: 'kg', category: 'Meyve' },
  { name: 'Şeftali', emoji: '🍑', unit: 'kg', category: 'Meyve' },
  { name: 'Nektarin', emoji: '🍑', unit: 'kg', category: 'Meyve' },
  { name: 'Kayısı', emoji: '🍑', unit: 'kg', category: 'Meyve' },
  { name: 'Erik', emoji: '🍑', unit: 'kg', category: 'Meyve' },
  { name: 'Kavun', emoji: '🍈', unit: 'kg', category: 'Meyve' },
  { name: 'Karpuz', emoji: '🍉', unit: 'kg', category: 'Meyve' },
  { name: 'Nar', emoji: '🔴', unit: 'kg', category: 'Meyve' },
  { name: 'İncir', emoji: '🟣', unit: 'kg', category: 'Meyve' },
  { name: 'Kivi', emoji: '🥝', unit: 'kg', category: 'Meyve' },
  { name: 'Avokado', emoji: '🥑', unit: 'kg', category: 'Meyve' },
  { name: 'Dut', emoji: '🫐', unit: 'kg', category: 'Meyve' },
  { name: 'Ahududu', emoji: '🫐', unit: 'kg', category: 'Meyve' },
  { name: 'Böğürtlen', emoji: '🫐', unit: 'kg', category: 'Meyve' },
  { name: 'Yaban Mersini', emoji: '🫐', unit: 'kg', category: 'Meyve' },
  { name: 'Ananas', emoji: '🍍', unit: 'kg', category: 'Meyve' },
  { name: 'Mango', emoji: '🥭', unit: 'kg', category: 'Meyve' },
  { name: 'Trabzon Hurması', emoji: '🟠', unit: 'kg', category: 'Meyve' },
  { name: 'Ayva', emoji: '🟡', unit: 'kg', category: 'Meyve' },
  { name: 'Malta Eriği', emoji: '🟡', unit: 'kg', category: 'Meyve' },
  { name: 'Hurma', emoji: '🟤', unit: 'kg', category: 'Meyve' },
  { name: 'Muşmula', emoji: '🟡', unit: 'kg', category: 'Meyve' },
  // Diğer
  { name: 'Ceviz', emoji: '🌰', unit: 'kg', category: 'Diğer' },
  { name: 'Fındık', emoji: '🌰', unit: 'kg', category: 'Diğer' },
  { name: 'Badem', emoji: '🌰', unit: 'kg', category: 'Diğer' },
  { name: 'Antep Fıstığı', emoji: '🟢', unit: 'kg', category: 'Diğer' },
  { name: 'Kestane', emoji: '🌰', unit: 'kg', category: 'Diğer' },
  { name: 'Nohut', emoji: '🫘', unit: 'kg', category: 'Diğer' },
  { name: 'Mercimek', emoji: '🫘', unit: 'kg', category: 'Diğer' },
  { name: 'Ay Çekirdeği', emoji: '🌻', unit: 'kg', category: 'Diğer' },
  { name: 'Kabak Çekirdeği', emoji: '🟢', unit: 'kg', category: 'Diğer' },
  { name: 'Kuru İncir', emoji: '🟤', unit: 'kg', category: 'Diğer' },
  { name: 'Kuru Kayısı', emoji: '🟠', unit: 'kg', category: 'Diğer' },
  { name: 'Kuru Üzüm', emoji: '🟤', unit: 'kg', category: 'Diğer' },
  { name: 'Kuru Erik', emoji: '🟣', unit: 'kg', category: 'Diğer' },
];

export default function GroceryProducts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
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

  const existingNames = useMemo(
    () => new Set(products.map((p) => p.name.toLowerCase())),
    [products]
  );

  const form = useForm({
    initialValues: {
      name: '',
      category: null as number | null,
      unit: 'kg',
      sell_price: '' as string | number,
      low_stock_threshold: 0 as string | number,
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
      formData.append('sell_price', parseFloat(String(values.sell_price) || '0').toFixed(2));
      formData.append('low_stock_threshold', parseFloat(String(values.low_stock_threshold) || '0').toFixed(2));
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

  const selectPreset = (preset: Preset) => {
    closePicker();
    setEditing(null);
    setIconFile(null);
    const matchedCategory = categories.find(
      (c) => c.name.toLowerCase() === preset.category.toLowerCase()
    );
    form.setValues({
      name: preset.name,
      category: matchedCategory?.pk ?? null,
      unit: preset.unit,
      sell_price: '',
      low_stock_threshold: preset.unit === 'kg' ? 2 : 1,
      expiry_note: '',
    });
    open();
  };

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
          <Button leftSection={<IconPlus size={16} />} onClick={openPicker} size='sm' color='green'>
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

      {/* Preset picker modal */}
      <Modal
        opened={pickerOpened}
        onClose={closePicker}
        title='Hızlı Ürün Ekle'
        size='lg'
        scrollAreaComponent={ScrollArea.Autosize}
        transitionProps={{ duration: 0 }}
      >
        <Stack gap='md'>
          <SimpleGrid cols={4} spacing='xs'>
            {PRESET_PRODUCTS.map((preset) => {
              const isAdded = existingNames.has(preset.name.toLowerCase());
              return (
                <Paper
                  key={preset.name}
                  p='xs'
                  style={{
                    textAlign: 'center',
                    cursor: isAdded ? 'default' : 'pointer',
                    opacity: isAdded ? 0.35 : 1,
                    border: '1px solid #e8f5e9',
                  }}
                  onClick={isAdded ? undefined : () => selectPreset(preset)}
                >
                  <Text size='xl' style={{ lineHeight: 1 }}>{preset.emoji}</Text>
                  <Text size='xs' fw={500} lineClamp={2} mt={4} style={{ lineHeight: 1.2 }}>{preset.name}</Text>
                </Paper>
              );
            })}
          </SimpleGrid>
          <Button
            variant='subtle'
            color='gray'
            size='sm'
            onClick={() => { closePicker(); openNew(); }}
          >
            Manuel ekle →
          </Button>
        </Stack>
      </Modal>

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
