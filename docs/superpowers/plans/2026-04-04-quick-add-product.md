# Quick Add Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-step "Hızlı Ürün Ekle" picker modal to GroceryProducts so greengrocers can add common Turkish produce in seconds by tapping a preset card rather than typing everything from scratch.

**Architecture:** Single-file change to `GroceryProducts.tsx`. A `PRESET_PRODUCTS` constant (above the component) drives an emoji-grid picker modal. Tapping a preset closes the picker and opens the existing form modal pre-filled — leaving price blank. No backend changes.

**Tech Stack:** React 19, TypeScript, Mantine 8 (Modal, SimpleGrid, ScrollArea, Paper), Vitest + @testing-library/react

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/pages/GroceryProducts.tsx` | Add preset constant, picker modal, selectPreset function |
| `frontend/src/pages/__tests__/GroceryProducts.test.tsx` | Update one existing test, add 4 new tests |

---

## Task 1: Preset data + picker modal UI

**Files:**
- Modify: `frontend/src/pages/GroceryProducts.tsx`
- Modify: `frontend/src/pages/__tests__/GroceryProducts.test.tsx`

- [ ] **Step 1: Update the failing test — "Ürün Ekle" now opens picker, not form**

Replace the existing `'opens add product modal when Ürün Ekle is clicked'` test in `frontend/src/pages/__tests__/GroceryProducts.test.tsx`:

```tsx
it('opens picker modal when Ürün Ekle is clicked', async () => {
  renderComponent();
  await waitFor(() => {
    expect(screen.getByText('Ürünler')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
  await waitFor(() => {
    expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx vitest run src/pages/__tests__/GroceryProducts.test.tsx 2>&1 | tail -15
```

Expected: `FAIL` — "Unable to find an element with the text: Hızlı Ürün Ekle"

- [ ] **Step 3: Add `Preset` interface, `PRESET_PRODUCTS` constant, and new imports to `GroceryProducts.tsx`**

Add `ScrollArea` and `SimpleGrid` to the Mantine import block:

```tsx
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
```

Then add the following above the `Category` interface (before the component, at the top of the file after imports):

```tsx
interface Preset {
  name: string;
  emoji: string;
  unit: 'kg' | 'adet';
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
```

- [ ] **Step 4: Add `pickerOpened` state and `existingNames` memo inside the component**

Inside `GroceryProducts()`, after the existing `useDisclosure` line:

```tsx
const [pickerOpened, { open: openPicker, close: closePicker }] = useDisclosure(false);
```

After the `filteredProducts` memo (or anywhere after `products` is defined):

```tsx
const existingNames = useMemo(
  () => new Set(products.map((p) => p.name.toLowerCase())),
  [products]
);
```

- [ ] **Step 5: Change "Ürün Ekle" header button to open the picker**

Find this in the JSX:
```tsx
<Button leftSection={<IconPlus size={16} />} onClick={openNew} size='sm' color='green'>
  Ürün Ekle
</Button>
```

Replace with:
```tsx
<Button leftSection={<IconPlus size={16} />} onClick={openPicker} size='sm' color='green'>
  Ürün Ekle
</Button>
```

- [ ] **Step 6: Add the picker modal JSX — place it just before the existing `<Modal opened={opened}` block**

```tsx
{/* Preset picker modal */}
<Modal
  opened={pickerOpened}
  onClose={closePicker}
  title='Hızlı Ürün Ekle'
  size='lg'
  scrollAreaComponent={ScrollArea.Autosize}
>
  <Stack gap='md'>
    <SimpleGrid cols={4} spacing='xs'>
      {PRESET_PRODUCTS.map((preset) => {
        const isAdded = existingNames.has(preset.name.toLowerCase());
        return (
          <Paper
            key={preset.name}
            p='xs'
            withBorder
            style={{
              textAlign: 'center',
              cursor: isAdded ? 'default' : 'pointer',
              opacity: isAdded ? 0.35 : 1,
              border: '1px solid #e8f5e9',
            }}
            onClick={isAdded ? undefined : () => selectPreset(preset)}
          >
            <Text size='xl' style={{ lineHeight: 1 }}>{preset.emoji}</Text>
            <Text size='xs' fw={500} lineClamp={1} mt={4}>{preset.name}</Text>
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
```

Note: `selectPreset` is defined in Task 2 — the file won't compile until that step is complete.

- [ ] **Step 7: Run the updated test to verify it now passes**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx vitest run src/pages/__tests__/GroceryProducts.test.tsx 2>&1 | tail -15
```

Expected: all tests pass (the `selectPreset` function is a stub for now — add it before this step if needed to compile).

---

## Task 2: Pre-fill wiring + category match + new tests

**Files:**
- Modify: `frontend/src/pages/GroceryProducts.tsx`
- Modify: `frontend/src/pages/__tests__/GroceryProducts.test.tsx`

- [ ] **Step 1: Add 4 new failing tests to `GroceryProducts.test.tsx`**

The mock currently returns the same value for all `api.get` calls. For category-specific tests, we need the mock to handle both products and categories endpoints. Update `beforeEach` and add a helper:

At the top of the `describe` block, update `beforeEach` to return different data per endpoint:

```tsx
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('categories')) return Promise.resolve({ data: mockCategories });
    return Promise.resolve({ data: mockProducts });
  });
});
```

Then add these 4 tests after the existing ones:

```tsx
it('shows preset picker with emoji cards', async () => {
  renderComponent();
  await waitFor(() => expect(screen.getByText('Ürünler')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
  await waitFor(() => {
    expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument();
    expect(screen.getByText('Salatalık')).toBeInTheDocument();
  });
});

it('dims already-added products in the picker', async () => {
  renderComponent();
  await waitFor(() => expect(screen.getByText('Ürünler')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
  await waitFor(() => expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument());
  // "Domates" exists in mockProducts — find its card and check opacity
  const domatesTomato = screen.getAllByText('Domates');
  // The one inside the picker modal Paper card
  const pickerCard = domatesTomato[domatesTomato.length - 1].closest('[style*="opacity"]');
  expect(pickerCard).toHaveStyle({ opacity: '0.35' });
});

it('opens form pre-filled with preset name when preset tapped', async () => {
  renderComponent();
  await waitFor(() => expect(screen.getByText('Ürünler')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
  await waitFor(() => expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument());
  // Click a preset that is NOT in mockProducts (not dimmed)
  fireEvent.click(screen.getByText('Salatalık'));
  await waitFor(() => {
    expect(screen.getByText('Yeni Ürün')).toBeInTheDocument();
  });
  // Name field should be pre-filled
  const nameInput = screen.getByLabelText('Ad');
  expect((nameInput as HTMLInputElement).value).toBe('Salatalık');
});

it('opens blank form when Manuel ekle is clicked', async () => {
  renderComponent();
  await waitFor(() => expect(screen.getByText('Ürünler')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Ürün Ekle/i }));
  await waitFor(() => expect(screen.getByText('Hızlı Ürün Ekle')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Manuel ekle →'));
  await waitFor(() => {
    expect(screen.getByText('Yeni Ürün')).toBeInTheDocument();
  });
  // Name field should be blank
  const nameInput = screen.getByLabelText('Ad');
  expect((nameInput as HTMLInputElement).value).toBe('');
});
```

- [ ] **Step 2: Run to confirm the 4 new tests fail**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx vitest run src/pages/__tests__/GroceryProducts.test.tsx 2>&1 | tail -20
```

Expected: the 4 new tests FAIL (selectPreset not yet implemented or picker not pre-filling).

- [ ] **Step 3: Add `selectPreset` function to `GroceryProducts.tsx`**

Inside the component, after `openNew`:

```tsx
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
    sell_price: undefined as unknown as number,
    low_stock_threshold: preset.unit === 'kg' ? 2 : 1,
    expiry_note: '',
  });
  open();
};
```

- [ ] **Step 4: Run all tests and verify everything passes**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx vitest run 2>&1 | tail -10
```

Expected:
```
Test Files  7 passed (7)
     Tests  44 passed (44)
```

- [ ] **Step 5: Build check**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in Xs` with no errors.

- [ ] **Step 6: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryProducts.tsx frontend/src/pages/__tests__/GroceryProducts.test.tsx && git commit -m "feat: hızlı ürün ekle — preset picker with 83 Turkish produce items"
```
