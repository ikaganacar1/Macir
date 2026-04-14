# Frontend Polish & QoL Design

**Goal:** Polish the existing Mantine-based UI — consistent loading states, empty states, responsive grids, unified utilities, and targeted functional QoL fixes — without changing the visual identity or navigation structure.

**Approach:** Foundation-first. Build shared components and utilities, fix cross-cutting issues, then apply improvements to the three highest-traffic pages and add functional QoL fixes to Finance, Profile, PriceEditor, WasteEntry, and Returns.

---

## Section 1: Shared Component Foundation

### New files

**`frontend/src/components/PageLayout.tsx`**
Encapsulates the sticky-header + scrollable-content + optional-sticky-footer shell used on every page. Props:
- `header: ReactNode` — rendered in a sticky `position: sticky, top: 0, zIndex: 10` box with the standard `#f9faf7` background and bottom border
- `footer?: ReactNode` — rendered in a `position: fixed, bottom: 0` full-width box; when provided, content area gets `paddingBottom: 100`
- `children: ReactNode` — scrollable content, wrapped in `<Stack p='md' gap='md'>`

All 10 pages (`GroceryRecordSales`, `GroceryWasteEntry`, `GroceryReturns`, `GroceryAddStock`, `GroceryProducts`, `GrocerySalesHistory`, `GroceryMarketPrices`, `GroceryProfile`, `GroceryFinance`, `GroceryPriceEditor`) adopt `<PageLayout>`.

**`frontend/src/components/EmptyState.tsx`**
Props:
- `icon: React.FC<{ size: number; color: string }>` — Tabler icon component
- `title: string` — primary message
- `subtitle?: string` — secondary message
- `action?: ReactNode` — optional button

Renders a centered `<Stack>` with the icon at 48px in `var(--mantine-color-gray-4)`, title in `fw={500}`, subtitle in `c='dimmed' size='sm'`.

**`frontend/src/utils/format.ts`**
Exports:
- `formatCurrency(n: string | number): string` — `₺` prefix, 2 decimal places, using `parseFloat`
- `formatShortDate(s: string): string` — Turkish short date e.g. "24 Nis" (replaces `trDate`, `fmt2`)
- `formatFullDate(s: string): string` — Turkish long date e.g. "24 Nisan 2026" (replaces `trFullDate`)

Replaces: inline `.toFixed(2)`, `fmt2()` in `GroceryDashboard`, `trDate()` in `GroceryDashboard`, `trFullDate()` in `utils/sales.ts` (keep `recordTotal` and other non-formatting helpers in `utils/sales.ts`).

### Cross-cutting fixes applied to all pages

**Responsive product grids**
Every `<SimpleGrid cols={3}>` in `GroceryRecordSales`, `GroceryWasteEntry`, and `GroceryReturns` changed to `<SimpleGrid cols={{ base: 2, sm: 3 }}>`. No other grid changes needed.

**Back button standardisation**
Every back/navigation button standardised to:
```tsx
<Button variant='subtle' color='gray' px='xs' onClick={() => navigate(-1)}>
  <IconArrowLeft size={20} />
</Button>
```
Affects: `GroceryAddStock`, `GroceryRecordSales`, `GroceryWasteEntry`, `GroceryReturns`, `GroceryPriceEditor`.

**Color semantics**
No new colors introduced. Existing usage corrected:
- Green (`color='green'`) — primary actions, positive money values, success states
- Orange (`color='orange'`) — warnings, low stock indicators only
- Red (`color='red'`) — destructive actions (delete buttons, loss values)
- Blue (`color='blue'`) — returns/refunds only

**Loading skeletons**
Pattern applied to every `useQuery` that feeds a list or stat card: while `isLoading` is true, render `<Skeleton>` placeholders matching the shape of the loaded content. Specific shapes:
- Stats cards: `<Skeleton height={36} width={90} radius='md' />`
- List rows: 3× `<Skeleton height={56} mb='xs' radius='md' />`
- Chart: `<Skeleton height={200} radius='md' />`

---

## Section 2: High-Traffic Page Improvements

### GroceryMain

**Stats cards loading state**
`total_sales`, `net_profit`, `items_sold` cards use `<Skeleton>` while `stats` is undefined (query loading). Currently shows raw `0.00`.

**Empty states**
- "Son Satışlar" list: `<EmptyState icon={IconShoppingBag} title='Henüz satış yok' />`
- Low stock alerts section: `<EmptyState icon={IconCircleCheck} title='Stok seviyeleri normal' subtitle='Tüm ürünler yeterli stokta' />`

**CTA hierarchy**
Remove the large standalone "Satış Yap" button (currently rendered above the nav grid with `h={70}`). The "Satış Yap" tile in the quick-actions grid is sufficient. The grid tile gets a filled green background (`variant='filled'`) to signal it as the primary action.

### GroceryRecordSales

**Stock level on product cards**
Each product card shows stock level below the price:
```tsx
<Text size='xs' c={stockColor} fw={500}>
  {product.stock_level} {product.unit}
</Text>
```
Where `stockColor` is `'red'` if `stock_level <= 0`, `'orange'` if at or below threshold, `'dimmed'` otherwise.

**Low stock indicator**
Replace the 8×8px orange dot with an orange `<Badge size='xs' color='orange' variant='filled' style={{ position: 'absolute', top: 4, right: 4 }}>Az</Badge>` on cards where stock is at or below threshold.

**Selected items footer**
The horizontal badge scroll stays but gets:
- A left and right CSS gradient fade (`linear-gradient`) on the `ScrollArea` wrapper to hint at scrollability
- A `Text` showing `{selectedCount} ürün seçildi` before the scroll area so the count is always visible without scrolling

### GroceryDashboard

**Chart loading state**
Renders `<Skeleton height={200} radius='md' />` while chart data is loading.

**Empty states**
- Best sellers: `<EmptyState icon={IconChartBar} title='Bu dönemde satış yok' />`
- Low stock section: `<EmptyState icon={IconCircleCheck} title='Stok seviyeleri normal' />`

**Cash/card badges**
Already implemented (sprint 2026-04-14). No change needed — they conditionally render when non-zero.

---

## Section 3: Functional QoL Improvements

### GroceryFinance

**Date picker**
Install `@mantine/dates` and `dayjs` (peer dependency): `npm install @mantine/dates dayjs`. Replace the three `<TextInput>` date fields (Add Entry modal, Add Debt modal, Add Payment modal) with `<DateInput valueFormat='YYYY-MM-DD' locale='tr' />`. The value format matches the backend `DateField` expectation. Turkish locale set via `dayjs/locale/tr`.

**Delete confirmation**
Entry and Debt delete actions (currently one-click) replaced with:
1. A `<Menu>` trigger on each row with a "Sil" item colored red
2. Clicking "Sil" sets a `deleteTarget` state (`{ type: 'entry' | 'debt', pk: number } | null`) and opens a confirmation `<Modal>` (controlled via `useDisclosure`) with title "Emin misiniz?", body "Bu kayıt kalıcı olarak silinecek.", a red "Sil" `<Button>` that calls the delete mutation, and a "İptal" `<Button variant='default'>` that closes the modal.

**Month navigation arrows**
Replace `<IconChevronUp style={{ transform: 'rotate(-90deg)' }}>` and `<IconChevronDown style={{ transform: 'rotate(-90deg)' }}>` with `<IconChevronLeft>` and `<IconChevronRight>` directly.

### GroceryProfile

**Geolocation error handling**
The `error` callback of `navigator.geolocation.getCurrentPosition` currently does nothing. Add:
```tsx
() => notifications.show({
  message: 'Konum izni reddedildi. Tarayıcı ayarlarından izin verin.',
  color: 'orange',
})
```

**Unsaved changes guard**
Track `isDirty` state (set to `true` when lat/lng/radius changes, reset to `false` on successful save). On back button click, if `isDirty`, open a `<Modal>` (controlled via `useDisclosure`) with title "Kaydedilmemiş değişiklikler", body "Kaydedilmemiş değişiklikler var. Çıkmak istiyor musunuz?", a "Çık" button that calls `navigate(-1)`, and an "İptal" `<Button variant='default'>` that closes the modal. If not dirty, navigate immediately.

### GroceryPriceEditor

**Revert button**
Add a "Geri Al" button in the sticky header, rendered only when `hasChanges`, that calls `setChangedPrices({})`. Placed to the left of the existing "Değişiklikleri Kaydet" button.

**Deterministic category order**
Replace `Object.entries(grouped)` (non-deterministic key order) with a sorted version: categories sorted by the `order` field derived from the product list. Products already carry `category` (pk) and `category_name`. Build a `categoryOrder` map from the first product seen per category (using the same order as the products API response, which orders by `category__order`).

### GroceryWasteEntry + GroceryReturns

**Save confirmation modal**
Before `saveMutation.mutate()` fires, open a `<Modal>` (controlled via `useDisclosure`) with:
- Title: "Kayıt onayı"
- Body: "{selectedCount} ürün kaydedilecek. Devam edilsin mi?"
- A "Kaydet" `<Button>` colored green (waste) or blue (returns) that closes the modal and calls `saveMutation.mutate()`
- An "İptal" `<Button variant='default'>` that closes the modal

The footer save button opens this modal instead of directly calling `saveMutation.mutate()`.

### Error messages

Every `onError` handler across all pages replaced with a specific Turkish message:

| Page | Current | New |
|---|---|---|
| GroceryRecordSales | "Satış kaydedilemedi" | "Satış kaydedilemedi — stok yetersiz olabilir" |
| GroceryAddStock | "Stok kaydedilemedi" | "Stok girişi kaydedilemedi" |
| GroceryWasteEntry | "Kaydedilemedi" | "Fire kaydedilemedi" |
| GroceryReturns | "İade kaydedilemedi" | "İade kaydedilemedi" (unchanged — already specific) |
| GroceryPriceEditor | "Güncelleme başarısız" | "Fiyat güncellenemedi — lütfen tekrar deneyin" |
| GroceryFinance (entry) | generic | "Kayıt eklenemedi" |
| GroceryFinance (delete) | generic | "Kayıt silinemedi" |
| GroceryFinance (debt) | generic | "Borç eklenemedi" |

Where the backend returns a structured error body (e.g., `{ items: ['stok yetersiz...'] }`), extract `error.response?.data?.items?.[0]` or `error.response?.data?.detail` as the notification message before falling back to the generic string.

---

## File Map

**New files:**
- `frontend/src/components/PageLayout.tsx`
- `frontend/src/components/EmptyState.tsx`
- `frontend/src/utils/format.ts`

**Modified files:**
- `frontend/src/pages/GroceryMain.tsx`
- `frontend/src/pages/GroceryDashboard.tsx`
- `frontend/src/pages/GroceryRecordSales.tsx`
- `frontend/src/pages/GroceryAddStock.tsx`
- `frontend/src/pages/GroceryProducts.tsx`
- `frontend/src/pages/GrocerySalesHistory.tsx`
- `frontend/src/pages/GroceryMarketPrices.tsx`
- `frontend/src/pages/GroceryProfile.tsx`
- `frontend/src/pages/GroceryFinance.tsx`
- `frontend/src/pages/GroceryPriceEditor.tsx`
- `frontend/src/pages/GroceryWasteEntry.tsx`
- `frontend/src/pages/GroceryReturns.tsx`

**No backend changes.**

---

## Out of Scope

- Navigation structure changes
- New pages or routes
- Design system token changes (spacing scale, custom theme extensions)
- `NumpadInput` desktop keyboard fallback
- Market price N+1 batching (separate perf task)
- Pagination for Finance debt payments
- Product icon alt text / full accessibility audit
