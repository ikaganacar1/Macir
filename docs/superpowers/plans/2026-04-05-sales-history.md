# Sales History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Son Satışlar" section to the main page and a full `/sales/history` page with expandable sale records, date filtering, and product name search.

**Architecture:** A single new `product_name` field is added to `SaleItemSerializer` (no migration). `GroceryMain` fetches all sale records and renders the last 5. `GrocerySalesHistory` reuses the same TanStack Query cache key (`['sale-records']`) and filters client-side with React state. All filtering (date range + product search) is combined with AND logic.

**Tech Stack:** Django REST Framework (serializer field), React 19, TypeScript, Mantine 8, TanStack Query 5, Vitest + Testing Library

---

## File Map

| Action | File |
|--------|------|
| Modify | `backend/grocery/serializers.py` |
| Modify | `backend/grocery/tests.py` |
| Modify | `frontend/src/types.ts` |
| Modify | `frontend/src/pages/GroceryMain.tsx` |
| Modify | `frontend/src/pages/__tests__/GroceryMain.test.tsx` |
| Create | `frontend/src/pages/GrocerySalesHistory.tsx` |
| Create | `frontend/src/pages/__tests__/GrocerySalesHistory.test.tsx` |
| Modify | `frontend/src/App.tsx` |

---

## Task 1: Add `product_name` to `SaleItemSerializer` (backend)

**Files:**
- Modify: `backend/grocery/serializers.py`
- Modify: `backend/grocery/tests.py`

### Context

`SaleItemSerializer` currently has fields `['pk', 'product', 'quantity', 'sell_price']`. We need to add `product_name` as a read-only CharField sourced from `product.name`.

The existing tests in `backend/grocery/tests.py` create `Category`, `Product`, `StockEntry`, and `SaleRecord` without `owner=...`. Since the `owner` FK is non-nullable (migration 0003 made it non-nullable), these will fail with `IntegrityError`. Fix them first.

- [ ] **Step 1: Fix existing test fixtures to include `owner`**

In `backend/grocery/tests.py`, update every `Category`, `Product`, `StockEntry`, and `SaleRecord` creation that's missing `owner`.

In `CategoryModelTest.test_create_category`:
```python
def test_create_category(self):
    from django.contrib.auth.models import User
    user = User.objects.create_user(username='u1', password='p')
    cat = Category.objects.create(name='Vegetables', order=1, owner=user)
    self.assertEqual(str(cat), 'Vegetables')
    self.assertEqual(cat.order, 1)
```

In `ProductModelTest.setUp`:
```python
def setUp(self):
    from django.contrib.auth.models import User
    self.user = User.objects.create_user(username='u1', password='p')
    self.cat = Category.objects.create(name='Fruits', order=1, owner=self.user)
```

In `ProductModelTest`, every `Product.objects.create(...)` needs `owner=self.user`:
```python
# test_create_product
p = Product.objects.create(
    name='Tomato', category=self.cat, unit='kg', sell_price='18.00',
    low_stock_threshold='5.00', owner=self.user,
)
# test_stock_level_starts_at_zero
p = Product.objects.create(
    name='Cucumber', category=self.cat, unit='kg', sell_price='12.00', owner=self.user,
)
# test_stock_level_after_entry
p = Product.objects.create(
    name='Lemon', category=self.cat, unit='kg', sell_price='25.00', owner=self.user,
)
entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
# test_stock_level_after_sale
p = Product.objects.create(
    name='Banana', category=self.cat, unit='kg', sell_price='22.00', owner=self.user,
)
entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
sale = SaleRecord.objects.create(date='2026-04-01', owner=self.user)
# test_most_recent_purchase_price
p = Product.objects.create(
    name='Onion', category=self.cat, unit='kg', sell_price='8.00', owner=self.user,
)
entry1 = StockEntry.objects.create(date='2026-03-25', owner=self.user)
entry2 = StockEntry.objects.create(date='2026-04-01', owner=self.user)
```

In `SerializerTest.setUp`:
```python
def setUp(self):
    from django.contrib.auth.models import User
    self.user = User.objects.create_user(username='u2', password='p')
    self.cat = Category.objects.create(name='Vegetables', order=1, owner=self.user)
    self.product = Product.objects.create(
        name='Tomato', category=self.cat, unit='kg', sell_price='18.00', owner=self.user,
    )
```

In `SerializerTest.test_stock_entry_serializer_nested`:
```python
entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
```

In `SerializerTest.test_sale_record_serializer_nested`:
```python
sale = SaleRecord.objects.create(date='2026-04-01', owner=self.user)
```

In `GroceryAPITest.setUp`, add `owner=self.user` to Category and Product:
```python
def setUp(self):
    self.user = User.objects.create_user(
        username='testuser', password='testpass123'
    )
    self.client.force_authenticate(user=self.user)
    self.cat = Category.objects.create(name='Fruits', order=1, owner=self.user)
    self.product = Product.objects.create(
        name='Tomato', category=self.cat, unit='kg', sell_price='18.00', owner=self.user,
    )
```

In `GroceryAPITest.test_create_sale_record`, the `StockEntry` is not present (the test sells without stock — this tests that the endpoint accepts the POST, not that stock is checked). No change needed there.

In `GroceryAPITest.test_create_stock_entry` and `test_dashboard_today` and `test_dashboard_profit_calculation`, add `owner=self.user` to `StockEntry.objects.create(...)` and `SaleRecord.objects.create(...)`:
```python
# test_dashboard_today
sale = SaleRecord.objects.create(date='2026-04-01', owner=self.user)
# test_dashboard_profit_calculation
entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
sale = SaleRecord.objects.create(date='2026-04-01', owner=self.user)
# test_create_stock_entry (no StockEntry/SaleRecord outside of the POST)
# test_create_sale_record (same)
```

- [ ] **Step 2: Run existing tests to verify they now pass**

```bash
cd backend && python manage.py test grocery
```

Expected: All existing tests pass. If any fail for a reason unrelated to owner, investigate before continuing.

- [ ] **Step 3: Commit the test fixes**

```bash
git add backend/grocery/tests.py
git commit -m "fix: add owner= to test fixtures for non-nullable owner FK"
```

- [ ] **Step 4: Write the new failing test**

In `backend/grocery/tests.py`, add this test to the `GroceryAPITest` class. Note `import json` is already at the top of the file — do not duplicate it.

```python
def test_sale_record_items_include_product_name(self):
    entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
    StockEntryItem.objects.create(
        entry=entry, product=self.product, quantity='10.000', purchase_price='12.00'
    )
    payload = {
        'date': '2026-04-01',
        'notes': '',
        'items': [
            {'product': self.product.pk, 'quantity': '2.500', 'sell_price': '18.00'}
        ],
    }
    import json
    r = self.client.post(
        '/api/grocery/sale-records/',
        data=json.dumps(payload),
        content_type='application/json',
    )
    self.assertEqual(r.status_code, 201)
    r2 = self.client.get('/api/grocery/sale-records/')
    self.assertEqual(r2.status_code, 200)
    self.assertEqual(r2.data[0]['items'][0]['product_name'], 'Tomato')
```

> Note: the `import json` inside the test body (from the original template) is not needed — `json` is already imported at the top of the file. Remove the inline import.

- [ ] **Step 5: Run test to verify it fails**

```bash
cd backend && python manage.py test grocery.tests.GroceryAPITest.test_sale_record_items_include_product_name
```

Expected: FAIL — `KeyError: 'product_name'` or `AssertionError`

- [ ] **Step 6: Add `product_name` to `SaleItemSerializer`**

In `backend/grocery/serializers.py`, update `SaleItemSerializer`:

```python
class SaleItemSerializer(serializers.ModelSerializer):
    """Serializer for SaleItem."""

    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = SaleItem
        fields = ['pk', 'product', 'product_name', 'quantity', 'sell_price']
```

- [ ] **Step 7: Run test to verify it passes**

```bash
cd backend && python manage.py test grocery.tests.GroceryAPITest.test_sale_record_items_include_product_name
```

Expected: OK

- [ ] **Step 8: Run all backend tests**

```bash
cd backend && python manage.py test grocery
```

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add backend/grocery/serializers.py backend/grocery/tests.py
git commit -m "feat: add product_name to SaleItemSerializer"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `frontend/src/types.ts`

### Context

`types.ts` currently has `Category`, `Product`, and `DashboardData` interfaces. It has no `SaleItem` or `SaleRecord` interfaces. We add both now. The frontend pages that create sale records (`GroceryRecordSales`) use inline types — they are unaffected by adding these new interfaces.

- [ ] **Step 1: Add `SaleItem` and `SaleRecord` interfaces to `types.ts`**

Open `frontend/src/types.ts` and append:

```ts
export interface SaleItem {
  pk: number;
  product: number;
  product_name: string;
  quantity: string;
  sell_price: string;
}

export interface SaleRecord {
  pk: number;
  date: string;
  notes: string;
  items: SaleItem[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run build 2>&1 | head -30
```

Expected: No type errors (build may fail on other things like missing env vars but no TS errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: add SaleItem and SaleRecord TypeScript interfaces"
```

---

## Task 3: Add "Son Satışlar" section to GroceryMain

**Files:**
- Modify: `frontend/src/pages/GroceryMain.tsx`
- Modify: `frontend/src/pages/__tests__/GroceryMain.test.tsx`

### Context

`GroceryMain` already fetches the dashboard via `api.get`. After this task it will also fetch `/api/grocery/sale-records/`. The existing test mocks `api.get` with a single `.mockResolvedValue` — we need to update it to handle two different endpoints.

The section goes between the `<SimpleGrid>` tertiary buttons and the logout `<Button>`.

- [ ] **Step 1: Update the existing test mock to handle two endpoints**

Replace the `beforeEach` in `frontend/src/pages/__tests__/GroceryMain.test.tsx`:

```ts
const mockSaleRecords = [
  {
    pk: 1,
    date: '2026-04-05',
    notes: '',
    items: [
      { pk: 1, product: 1, product_name: 'Domates', quantity: '3.000', sell_price: '18.00' },
    ],
  },
  {
    pk: 2,
    date: '2026-04-04',
    notes: '',
    items: [
      { pk: 2, product: 2, product_name: 'Elma', quantity: '2.000', sell_price: '12.00' },
    ],
  },
];

// ...inside describe(), update beforeEach:
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (String(url).includes('sale-records')) {
      return Promise.resolve({ data: mockSaleRecords });
    }
    return Promise.resolve({ data: mockStats });
  });
  vi.mocked(api.post).mockResolvedValue({});
});
```

Also update the `endpoints` mock at the top of the file to include `saleRecords`:

```ts
vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  endpoints: {
    dashboard: '/api/grocery/dashboard/',
    saleRecords: '/api/grocery/sale-records/',
  },
}));
```

- [ ] **Step 2: Write failing tests for the new section**

Add these tests to the `GroceryMain` describe block in `GroceryMain.test.tsx`:

```ts
it('renders Son Satışlar section header', async () => {
  renderComponent();
  await waitFor(() => {
    expect(screen.getByText('Son Satışlar')).toBeInTheDocument();
  });
});

it('renders Tümünü Görüntüle button that navigates to /sales/history', async () => {
  renderComponent();
  await waitFor(() => {
    expect(screen.getByTestId('btn-all-sales')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByTestId('btn-all-sales'));
  expect(mockNavigate).toHaveBeenCalledWith('/sales/history');
});

it('renders recent sale record rows with date and total', async () => {
  renderComponent();
  await waitFor(() => {
    // 3.000 × 18.00 = 54.00
    expect(screen.getByTestId('sale-row-1')).toBeInTheDocument();
    expect(screen.getByText('₺54.00')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd frontend && npm run test 2>&1 | grep -A 3 "Son Satışlar\|btn-all-sales\|sale-row"
```

Expected: tests fail — elements not found.

- [ ] **Step 4: Implement the Son Satışlar section in GroceryMain**

In `frontend/src/pages/GroceryMain.tsx`:

Add imports at the top:
```tsx
import { Skeleton } from '@mantine/core';
import type { SaleRecord } from '../types';
```

Add the query after the existing `stats` query:
```tsx
const { data: saleRecords, isLoading: salesLoading } = useQuery<SaleRecord[]>({
  queryKey: ['sale-records'],
  queryFn: () => api.get(endpoints.saleRecords).then((r) => r.data),
});

const recentSales = saleRecords?.slice(0, 5) ?? [];

function recordTotal(record: SaleRecord): string {
  const total = record.items.reduce(
    (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.sell_price),
    0
  );
  return total.toFixed(2);
}

function trFullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
```

Insert the section between the closing `</SimpleGrid>` of tertiary buttons and `<Box style={{ flex: 1 }} />`:

```tsx
{/* Son Satışlar */}
<Box>
  <Group justify='space-between' mb='xs'>
    <Text fw={600} size='sm'>Son Satışlar</Text>
    <Button
      variant='subtle'
      color='green'
      size='xs'
      p={0}
      data-testid='btn-all-sales'
      onClick={() => navigate('/sales/history')}
    >
      Tümünü Görüntüle →
    </Button>
  </Group>
  {salesLoading ? (
    <Stack gap='xs'>
      {[1, 2, 3].map((i) => <Skeleton key={i} h={36} radius='md' />)}
    </Stack>
  ) : recentSales.length === 0 ? (
    <Text size='sm' c='dimmed' ta='center' py='sm'>Henüz satış yok</Text>
  ) : (
    <Stack gap={4}>
      {recentSales.map((record) => (
        <Group
          key={record.pk}
          justify='space-between'
          px='sm'
          py='xs'
          data-testid={`sale-row-${record.pk}`}
          style={{
            background: 'white',
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid #e8f5e9',
          }}
        >
          <Text size='sm' c='dimmed'>{trFullDate(record.date)}</Text>
          <Text size='sm' fw={600} c='green'>₺{recordTotal(record)}</Text>
        </Group>
      ))}
    </Stack>
  )}
</Box>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npm run test 2>&1 | grep -E "PASS|FAIL|Son Satışlar|btn-all-sales|sale-row"
```

Expected: all GroceryMain tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/GroceryMain.tsx frontend/src/pages/__tests__/GroceryMain.test.tsx
git commit -m "feat: add Son Satışlar section to GroceryMain"
```

---

## Task 4: Create GrocerySalesHistory page

**Files:**
- Create: `frontend/src/pages/GrocerySalesHistory.tsx`
- Create: `frontend/src/pages/__tests__/GrocerySalesHistory.test.tsx`

### Context

This page reuses the `['sale-records']` TanStack Query key — it shares cache with GroceryMain, so if the user navigated from GroceryMain the data is already loaded.

Filtering logic:
- **Date range** (state: `'all' | 'today' | 'week' | 'month'`): compare `record.date` (ISO string `YYYY-MM-DD`) against computed boundaries using today's date
  - `today`: `record.date === todayStr`
  - `week`: `record.date >= mondayStr` (ISO week: Monday = `today - today.getDay() + (today.getDay() === 0 ? -6 : 1)`)
  - `month`: `record.date >= firstOfMonthStr`
- **Search** (state: `string`): at least one item's `product_name` includes the query (`.toLowerCase()`)
- Both combined with AND: a record must pass both filters to appear.

Expanded state: `Set<number>` of expanded record PKs — toggled on card tap.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/pages/__tests__/GrocerySalesHistory.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api', () => ({
  api: { get: vi.fn() },
  endpoints: { saleRecords: '/api/grocery/sale-records/' },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GrocerySalesHistory from '../GrocerySalesHistory';

const TODAY = '2026-04-05';

const mockRecords = [
  {
    pk: 1,
    date: TODAY,
    notes: '',
    items: [
      { pk: 1, product: 1, product_name: 'Domates', quantity: '3.000', sell_price: '18.00' },
    ],
  },
  {
    pk: 2,
    date: '2026-04-01',
    notes: 'test notu',
    items: [
      { pk: 2, product: 2, product_name: 'Elma', quantity: '2.000', sell_price: '12.00' },
    ],
  },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <GrocerySalesHistory />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GrocerySalesHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05'));
    vi.mocked(api.get).mockResolvedValue({ data: mockRecords });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders header with Satış Geçmişi title', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Satış Geçmişi')).toBeInTheDocument();
    });
  });

  it('renders all records by default', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
  });

  it('expands a record on click to show line items', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('sale-card-1'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-items-1')).toBeInTheDocument();
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
  });

  it('collapses an expanded record on second click', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('sale-card-1'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-items-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('sale-card-1'));
    await waitFor(() => {
      expect(screen.queryByTestId('sale-items-1')).not.toBeInTheDocument();
    });
  });

  it('shows notes when record is expanded and notes is non-empty', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('sale-card-2'));
    await waitFor(() => {
      expect(screen.getByText('test notu')).toBeInTheDocument();
    });
  });

  it('filters to today only when Bugün is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Bugün'));
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
      expect(screen.queryByTestId('sale-card-2')).not.toBeInTheDocument();
    });
  });

  it('filters records by product name search', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Ürün ara...'), {
      target: { value: 'Elma' },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('sale-card-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('sale-card-2')).toBeInTheDocument();
    });
  });

  it('shows Sonuç bulunamadı when filters produce no results', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('sale-card-1')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByPlaceholderText('Ürün ara...'), {
      target: { value: 'xyz-nonexistent' },
    });
    await waitFor(() => {
      expect(screen.getByText('Sonuç bulunamadı')).toBeInTheDocument();
    });
  });

  it('shows Henüz satış yok when no records exist', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Henüz satış yok')).toBeInTheDocument();
    });
  });

  it('navigates back when back button is clicked', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Satış Geçmişi')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm run test -- GrocerySalesHistory 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../GrocerySalesHistory'`

- [ ] **Step 3: Create `GrocerySalesHistory.tsx`**

Create `frontend/src/pages/GrocerySalesHistory.tsx`:

```tsx
import {
  Box,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { SaleRecord } from '../types';

type DateRange = 'all' | 'today' | 'week' | 'month';

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function getMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getFirstOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

function recordTotal(record: SaleRecord): string {
  const total = record.items.reduce(
    (sum, item) => sum + parseFloat(item.quantity) * parseFloat(item.sell_price),
    0
  );
  return total.toFixed(2);
}

function trFullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function applyFilters(
  records: SaleRecord[],
  dateRange: DateRange,
  search: string
): SaleRecord[] {
  const today = getToday();
  const monday = getMonday();
  const firstOfMonth = getFirstOfMonth();
  const q = search.toLowerCase();

  return records.filter((r) => {
    if (dateRange === 'today' && r.date !== today) return false;
    if (dateRange === 'week' && r.date < monday) return false;
    if (dateRange === 'month' && r.date < firstOfMonth) return false;
    if (q && !r.items.some((item) => item.product_name.toLowerCase().includes(q))) return false;
    return true;
  });
}

export default function GrocerySalesHistory() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: records = [], isLoading } = useQuery<SaleRecord[]>({
    queryKey: ['sale-records'],
    queryFn: () => api.get(endpoints.saleRecords).then((r) => r.data),
  });

  const filtered = applyFilters(records, dateRange, search);

  function toggleExpanded(pk: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  }

  const dateButtons: { label: string; value: DateRange }[] = [
    { label: 'Tümü', value: 'all' },
    { label: 'Bugün', value: 'today' },
    { label: 'Bu Hafta', value: 'week' },
    { label: 'Bu Ay', value: 'month' },
  ];

  return (
    <Stack gap={0} style={{ minHeight: '100vh', background: '#f9faf7' }}>
      {/* Sticky header */}
      <Box
        p='md'
        style={{
          position: 'sticky',
          top: 0,
          background: '#f9faf7',
          zIndex: 10,
          borderBottom: '1px solid #e8f5e9',
        }}
      >
        <Group>
          <Button
            variant='subtle'
            color='gray'
            px='xs'
            data-testid='btn-back'
            onClick={() => navigate(-1)}
            leftSection={<IconArrowLeft size={18} />}
          >
            {''}
          </Button>
          <Title order={4}>Satış Geçmişi</Title>
        </Group>
      </Box>

      {/* Filter bar */}
      <Stack p='md' gap='sm'>
        <Group gap='xs'>
          {dateButtons.map((btn) => (
            <Button
              key={btn.value}
              size='xs'
              variant={dateRange === btn.value ? 'filled' : 'light'}
              color='green'
              onClick={() => setDateRange(btn.value)}
            >
              {btn.label}
            </Button>
          ))}
        </Group>
        <TextInput
          placeholder='Ürün ara...'
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size='sm'
        />
      </Stack>

      {/* Record list */}
      <Stack px='md' pb='md' gap='sm'>
        {isLoading ? (
          [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={56} radius='md' />)
        ) : records.length === 0 ? (
          <Text c='dimmed' ta='center' py='xl'>Henüz satış yok</Text>
        ) : filtered.length === 0 ? (
          <Text c='dimmed' ta='center' py='xl'>Sonuç bulunamadı</Text>
        ) : (
          filtered.map((record) => {
            const isOpen = expanded.has(record.pk);
            return (
              <Paper
                key={record.pk}
                withBorder
                style={{ border: '1px solid #e8f5e9', overflow: 'hidden' }}
              >
                <Group
                  justify='space-between'
                  p='sm'
                  style={{ cursor: 'pointer' }}
                  data-testid={`sale-card-${record.pk}`}
                  onClick={() => toggleExpanded(record.pk)}
                >
                  <Text size='sm'>{trFullDate(record.date)}</Text>
                  <Group gap='xs'>
                    <Text size='sm' fw={700} c='green'>₺{recordTotal(record)}</Text>
                    {isOpen
                      ? <IconChevronUp size={16} color='gray' />
                      : <IconChevronDown size={16} color='gray' />}
                  </Group>
                </Group>

                {isOpen && (
                  <Box
                    data-testid={`sale-items-${record.pk}`}
                    px='sm'
                    pb='sm'
                    style={{ borderTop: '1px solid #e8f5e9' }}
                  >
                    {/* Column header */}
                    <Group justify='space-between' py='xs'>
                      <Text size='xs' c='dimmed' fw={600} style={{ flex: 3 }}>ÜRÜN</Text>
                      <Text size='xs' c='dimmed' fw={600} style={{ flex: 1, textAlign: 'right' }}>MİKTAR</Text>
                      <Text size='xs' c='dimmed' fw={600} style={{ flex: 1, textAlign: 'right' }}>FİYAT</Text>
                      <Text size='xs' c='dimmed' fw={600} style={{ flex: 1, textAlign: 'right' }}>TOPLAM</Text>
                    </Group>

                    {record.items.map((item) => {
                      const lineTotal = (
                        parseFloat(item.quantity) * parseFloat(item.sell_price)
                      ).toFixed(2);
                      return (
                        <Group key={item.pk} justify='space-between' py={4}>
                          <Text size='sm' style={{ flex: 3 }}>{item.product_name}</Text>
                          <Text size='sm' style={{ flex: 1, textAlign: 'right' }}>
                            {parseFloat(item.quantity).toFixed(2)}
                          </Text>
                          <Text size='sm' style={{ flex: 1, textAlign: 'right' }}>
                            ₺{parseFloat(item.sell_price).toFixed(2)}
                          </Text>
                          <Text size='sm' fw={600} style={{ flex: 1, textAlign: 'right' }}>
                            ₺{lineTotal}
                          </Text>
                        </Group>
                      );
                    })}

                    {record.notes ? (
                      <Text size='xs' c='dimmed' pt='xs' style={{ borderTop: '1px solid #f0f0f0' }}>
                        {record.notes}
                      </Text>
                    ) : null}
                  </Box>
                )}
              </Paper>
            );
          })
        )}
      </Stack>
    </Stack>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm run test -- GrocerySalesHistory 2>&1 | tail -30
```

Expected: All GrocerySalesHistory tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GrocerySalesHistory.tsx frontend/src/pages/__tests__/GrocerySalesHistory.test.tsx
git commit -m "feat: add GrocerySalesHistory page with filters and expandable records"
```

---

## Task 5: Register route in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add lazy import and route**

In `frontend/src/App.tsx`, add the lazy import after the existing lazy imports:

```tsx
const GrocerySalesHistory = lazy(() => import('./pages/GrocerySalesHistory'));
```

Add the route inside `<Routes>`, after the `/sales/new` route:

```tsx
<Route path='/sales/history' element={<GrocerySalesHistory />} />
```

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: register /sales/history route"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && python manage.py test grocery
```

Expected: All tests pass.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: All tests pass.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected: No errors.
