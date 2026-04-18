import {
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
import { IconArrowLeft, IconEdit, IconPlus, IconSearch, IconTag, IconUpload } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import PageLayout from '../components/PageLayout';
import { api, endpoints } from '../api';
import type { MarketPriceResult, Category, Product, StoreProfile } from '../types';
import { getMarketLogo } from '../utils/marketLogos';

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

function MarketPriceIndicator({ productName, productPk, lat, lng }: { productName: string; productPk: number; lat: number; lng: number }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isFetching } = useQuery<{ results: MarketPriceResult[] }>({
    queryKey: ['market-prices', productName, lat != null ? lat.toFixed(3) : null, lng != null ? lng.toFixed(3) : null],
    queryFn: () =>
      api.get(endpoints.marketPrices, { params: { q: productName } }).then((r) => r.data),
    staleTime: 30 * 60 * 1000,
    enabled,
  });

  const cheapest = data?.results?.[0]?.cheapest_stores?.[0];

  if (!enabled) {
    return (
      <Text
        size='xs'
        c='green'
        style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
        onClick={() => setEnabled(true)}
        data-testid={`market-price-${productPk}`}
      >
        Piyasa fiyatı gör
      </Text>
    );
  }

  if (isFetching) return <Text size='xs' c='dimmed'>Yükleniyor...</Text>;
  if (!cheapest) return <Text size='xs' c='dimmed'>Fiyat bulunamadı</Text>;

  const logo = getMarketLogo(cheapest.market);
  return (
    <Group gap={4} align='center' mt={2} data-testid={`market-price-${productPk}`}>
      {logo ? (
        <img src={logo} alt={cheapest.market} style={{ height: 14, width: 'auto', objectFit: 'contain', display: 'block' }} />
      ) : (
        <Text size='xs' c='dimmed'>{cheapest.market.toUpperCase()}</Text>
      )}
      <Text size='xs' c='dimmed'>₺{cheapest.price.toFixed(2)}</Text>
    </Group>
  );
}

export default function GroceryProducts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [clearIcon, setClearIcon] = useState(false);

  const { data: profile } = useQuery<StoreProfile>({
    queryKey: ['store-profile'],
    queryFn: () => api.get(endpoints.profile).then((r) => r.data),
  });

  const profileLat = profile?.latitude ?? 41.0082;
  const profileLng = profile?.longitude ?? 28.9784;

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
    setClearIcon(false);
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
    setClearIcon(false);
    form.reset();
    open();
  };

  const saveMutation = useMutation({
    mutationFn: (values: typeof form.values) => {
      const baseFields = {
        name: values.name,
        category: values.category,
        unit: values.unit,
        sell_price: parseFloat(String(values.sell_price) || '0').toFixed(2),
        low_stock_threshold: parseFloat(String(values.low_stock_threshold) || '0').toFixed(2),
        expiry_note: values.expiry_note,
      };

      if (editing) {
        if (iconFile) {
          // PATCH with new file: multipart
          const fd = new FormData();
          Object.entries(baseFields).forEach(([k, v]) => {
            if (v != null) fd.append(k, String(v));
          });
          fd.append('svg_icon', iconFile);
          return api.patch(`${endpoints.products}${editing.pk}/`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
        // PATCH without file: JSON (clears icon if clearIcon)
        return api.patch(`${endpoints.products}${editing.pk}/`, clearIcon ? { ...baseFields, svg_icon: null } : baseFields);
      }

      // POST new product: multipart (icon optional)
      const fd = new FormData();
      Object.entries(baseFields).forEach(([k, v]) => {
        if (v != null) fd.append(k, String(v));
      });
      if (iconFile) fd.append('svg_icon', iconFile);
      return api.post(endpoints.products, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
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
    <PageLayout
      header={
        <Group justify='space-between'>
          <Group gap='xs'>
            <Button variant='subtle' color='gray' px='xs' onClick={() => navigate(-1)} aria-label='Geri dön'>
              <IconArrowLeft size={20} />
            </Button>
            <Title order={4}>Ürünler</Title>
          </Group>
          <Group gap='xs'>
            <Button
              variant='light'
              color='green'
              size='sm'
              leftSection={<IconTag size={16} />}
              onClick={() => navigate('/products/prices')}
            >
              Fiyatları Düzenle
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={openPicker} size='sm' color='green'>
              Ürün Ekle
            </Button>
          </Group>
        </Group>
      }
    >
      <TextInput
        placeholder='Ürün ara...'
        leftSection={<IconSearch size={16} />}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />

      {filteredProducts.map((product) => (
        <Paper key={product.pk} withBorder p='sm' style={{ border: '1px solid #e8f5e9' }}>
          <Group justify='space-between'>
            <Group gap='sm' align='flex-start'>
              {product.svg_icon && (
                <img
                  src={product.svg_icon}
                  alt={product.name}
                  style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0, marginTop: 2 }}
                />
              )}
              <div>
                <Text fw={600} c={product.is_active ? undefined : 'dimmed'}>
                  {product.name} {!product.is_active && '(pasif)'}
                </Text>
                <Text size='xs' c='dimmed'>
                  {product.category_name} · ₺{product.sell_price}/{product.unit}
                </Text>
                <MarketPriceIndicator productName={product.name} productPk={product.pk} lat={profileLat} lng={profileLng} />
              </div>
            </Group>
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
            {editing?.svg_icon && !clearIcon && !iconFile && (
              <Group gap='xs' align='center'>
                <img
                  src={editing.svg_icon}
                  alt='Mevcut ikon'
                  style={{ width: 36, height: 36, objectFit: 'contain', border: '1px solid #e8f5e9', borderRadius: 6, padding: 2 }}
                />
                <Stack gap={0}>
                  <Text size='xs' c='dimmed'>Mevcut ikon</Text>
                  <Text size='xs' c='red' style={{ cursor: 'pointer' }} onClick={() => setClearIcon(true)}>
                    Kaldır
                  </Text>
                </Stack>
              </Group>
            )}
            {clearIcon && (
              <Group gap='xs'>
                <Text size='xs' c='dimmed'>İkon kaydedildiğinde kaldırılacak.</Text>
                <Text size='xs' c='blue' style={{ cursor: 'pointer' }} onClick={() => setClearIcon(false)}>Geri al</Text>
              </Group>
            )}
            <FileInput
              label='İkon (PNG, JPEG, WebP)'
              placeholder={editing?.svg_icon && !clearIcon ? 'Değiştirmek için seç...' : 'Dosya seç...'}
              leftSection={<IconUpload size={14} />}
              value={iconFile}
              onChange={(f) => { setIconFile(f); if (f) setClearIcon(false); }}
              accept='image/png,image/jpeg,image/webp,image/gif'
              clearable
            />
            <Group grow>
              <Button variant='default' onClick={close}>İptal</Button>
              <Button type='submit' color='green' loading={saveMutation.isPending}>Kaydet</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </PageLayout>
  );
}
