# Sales History Feature — Design Spec

**Date:** 2026-04-05

## Overview

Add a sales history view to the app: a compact "Son Satışlar" section on the main page showing the last 5 records with a "Tümünü Görüntüle" button, plus a full `/sales/history` page with expandable records, date filtering, and product name search.

---

## 1. Backend Change

**File:** `backend/grocery/serializers.py` — `SaleItemSerializer`

Add `product_name` as a read-only field:

```python
product_name = serializers.CharField(source='product.name', read_only=True)
```

Updated fields: `['pk', 'product', 'product_name', 'quantity', 'sell_price']`

No migration required. The field is read-only and sourced from the existing FK.

**File:** `frontend/src/types.ts` — `SaleItem` interface

Add `product_name: string` to the `SaleItem` interface. Also add a `SaleRecord` interface:

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

---

## 2. GroceryMain — "Son Satışlar" Section

**File:** `frontend/src/pages/GroceryMain.tsx`

Add a "Son Satışlar" section between the tertiary action buttons and the logout button.

### Data
- Fetch `/api/grocery/sale-records/` via TanStack Query (`queryKey: ['sale-records']`)
- Display the first 5 results (backend already returns records ordered by `-date`)
- Compute each record's total: `Σ (parseFloat(item.quantity) × parseFloat(item.sell_price))`

### UI
- Section header: "Son Satışlar" (left) + "Tümünü Görüntüle →" link button (right) — navigates to `/sales/history`
- Each row: date (Turkish locale, e.g. "5 Nisan 2026") left-aligned, total `₺X.XX` right-aligned
- Loading state: Mantine `Skeleton` rows
- Empty state: dimmed text "Henüz satış yok"

---

## 3. Sales History Page

**File:** `frontend/src/pages/GrocerySalesHistory.tsx` (new)  
**Route:** `/sales/history` (added to `App.tsx`)

### Data
- Fetch all sale records from `/api/grocery/sale-records/` via TanStack Query (`queryKey: ['sale-records']`)
- All filtering is done client-side in React state

### Sticky Header
- Back arrow (`IconArrowLeft`) → `navigate(-1)`
- Title: "Satış Geçmişi"
- Same sticky style as `GroceryDashboard`

### Filter Bar (below header, scrolls with page)
- **Quick date buttons** using Mantine `SegmentedControl` or button group:
  - Bugün / Bu Hafta / Bu Ay / Tümü (default: Tümü)
  - "Bugün": `record.date === today`
  - "Bu Hafta": `record.date >= start of current ISO week`
  - "Bu Ay": `record.date >= first day of current month`
- **Search input** (`TextInput`, placeholder: "Ürün ara..."): filters records where at least one item's `product_name` contains the query (case-insensitive)
- Both filters combine with AND logic

### Record List
Each record renders as a `Paper` card:
- **Collapsed**: date (Turkish formatted) on the left, total `₺X.XX` on the right, chevron icon indicating expandable
- **Expanded** (toggle on tap): reveals a list of line items below the header row
  - Columns: product name | quantity | unit price | line total
  - `SaleItem` does not carry the product unit; omit unit label and show quantity as a plain number
  - Notes field shown below items if non-empty
- Multiple records can be expanded simultaneously; each card toggles independently

### Empty State
- If filtered list is empty: centered text "Sonuç bulunamadı"
- If no records at all (before any filters): "Henüz satış yok"

---

## 4. Routing

**File:** `frontend/src/App.tsx`

Add lazy import and route:
```tsx
const GrocerySalesHistory = lazy(() => import('./pages/GrocerySalesHistory'));
// ...
<Route path='/sales/history' element={<GrocerySalesHistory />} />
```

---

## 5. Testing

- Update existing `GroceryMain` test to account for the new "Son Satışlar" section (mock `sale-records` endpoint)
- Add basic test for `GrocerySalesHistory`: renders records, filter buttons work, search filters by product name
- Backend: `SaleRecordSerializer` response now includes `product_name` in items — update or add an assertion in `GroceryAPITest`
