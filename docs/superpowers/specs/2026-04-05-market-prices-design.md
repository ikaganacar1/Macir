# Market Prices Feature — Design Spec

**Date:** 2026-04-05

## Overview

Add real-time market price data from [marketfiyati.org.tr](https://marketfiyati.org.tr) to two surfaces:

1. **Products page** — each product card automatically shows the cheapest market price as a passive indicator
2. **Market Prices search page** (`/market-prices`) — dedicated keyword search page showing cheapest 5 stores per result

A Django proxy endpoint handles all external API calls (browser cannot call `api.marketfiyati.org.tr` directly due to CORS). Results are cached in-process for 30 minutes per keyword.

---

## 1. Backend — `backend/grocery/market_prices.py`

New standalone module. No new Django app — added to the existing `grocery` app.

### `fetch_market_prices(keywords: str) -> list[dict]`

Pure function (no Django dependencies) that:
1. POSTs to `https://api.marketfiyati.org.tr/api/v2/search` with `{"keywords": keywords}` and the existing headers from the MCP server (`cache-control: no-cache`, `content-type: application/json`, User-Agent spoofing)
2. Parses the JSON response
3. Returns a list of result dicts, each with:
   - `id`, `title`, `brand`, `imageUrl` (nullable)
   - `cheapest_stores`: up to 5 stores from `productDepotInfoList`, sorted ascending by `price`, each with `{ market, price, unitPrice }`
4. On network error or non-200 response: returns `[]`
5. Timeout: 10 seconds

### `market_price_search` view

`GET /api/market-prices/search/?q=<keywords>`

- Requires `IsAuthenticated`
- Reads `?q` param; returns `{"results": [], "error": "missing q"}` with 400 if absent
- Cache key: `f"market_price:{keywords.strip().lower()}"`, TTL 1800 seconds (30 min), using Django's default cache (`LocMemCache` in dev, same in prod unless overridden)
- On cache hit: returns cached JSON immediately
- On cache miss: calls `fetch_market_prices`, caches result, returns `{"results": [...]}`
- Empty result from external API: returns `{"results": []}` (still cached to avoid hammering)

### URL registration

In `backend/config/urls.py`, add the import and path:
```python
from grocery.market_prices import market_price_search
# ...
path('api/market-prices/search/', market_price_search),
```

---

## 2. TypeScript types — `frontend/src/types.ts`

Append:

```ts
export interface MarketStore {
  market: string;
  price: number;
  unitPrice: string;
}

export interface MarketPriceResult {
  id: string;
  title: string;
  brand: string;
  imageUrl: string | null;
  cheapest_stores: MarketStore[];
}
```

---

## 3. API client — `frontend/src/api.ts`

Add endpoint:
```ts
marketPrices: '/api/market-prices/search/',
```

---

## 4. Products Page — market price indicator

**File:** `frontend/src/pages/GroceryProducts.tsx`

For each product in the rendered list, fire a separate TanStack Query:

```ts
queryKey: ['market-price', product.name]
queryFn: () => api.get(endpoints.marketPrices, { params: { q: product.name } }).then(r => r.data)
```

The query is enabled only when the product is rendered (standard React render-triggered behaviour — no special logic needed).

**Indicator UI** (inside each product card, below the sell price):
- **Loading**: nothing rendered (silent)
- **Result with ≥1 store**: small dimmed text — `📍 {cheapest.market.toUpperCase()} ₺{cheapest.price.toFixed(2)}` — using the first store from `cheapest_stores`
- **No result / error**: nothing rendered

The indicator is purely informational — no click interaction.

---

## 5. Market Prices Page — `frontend/src/pages/GroceryMarketPrices.tsx`

**Route:** `/market-prices` (added to `App.tsx`)

### Header
Sticky header: back arrow (`navigate(-1)`) + "Piyasa Fiyatları" title. Same sticky style as `GroceryDashboard` and `GrocerySalesHistory`.

### Search bar
- `TextInput` with placeholder "Ürün adı yazın..." + "Ara" `Button` (green)
- Search is triggered on button click or Enter key — NOT on keystroke (avoid excess API calls)
- Local state: `query` (input value) and `submittedQuery` (what was last searched); TanStack Query key uses `submittedQuery`
- Query only fires when `submittedQuery` is non-empty (`enabled: !!submittedQuery`)

### States
- **Initial** (submittedQuery empty): centered helper text "Bir ürün adı yazın ve fiyatları karşılaştırın"
- **Loading**: 3 `Skeleton` cards
- **Empty result**: "Sonuç bulunamadı"
- **Results**: list of `Paper` cards (see below)

### Result cards
Each `MarketPriceResult` renders as a `Paper` card:
- **Collapsed**: product title (left) + brand dimmed (right), chevron indicator
- **Expanded** (toggle on tap): list of up to 5 cheapest stores with columns: market name | price | unit price
- Multiple cards can be expanded simultaneously (same toggle pattern as `GrocerySalesHistory`)

### Main page button
In `GroceryMain.tsx`, add a third button below the existing 2-column `SimpleGrid` of tertiary buttons:

```tsx
<Button
  variant='default'
  h={56}
  fullWidth
  leftSection={<IconShoppingBag size={20} />}
  onClick={() => navigate('/market-prices')}
  data-testid='btn-market-prices'
>
  Piyasa Fiyatları
</Button>
```

---

## 6. Routing — `frontend/src/App.tsx`

Add lazy import and route:
```tsx
const GroceryMarketPrices = lazy(() => import('./pages/GroceryMarketPrices'));
// ...
<Route path='/market-prices' element={<GroceryMarketPrices />} />
```

---

## 7. Testing

### Backend
- Unit test `fetch_market_prices` with a mocked `requests.post` — verify correct endpoint, headers, response parsing, cheapest-5 sorting, error handling returning `[]`
- API test for `market_price_search`: authenticated request returns 200 with `results`; unauthenticated returns 401; missing `q` returns 400; result is cached on second call (mock requests, verify called once)

### Frontend
- `GroceryMarketPrices`: renders initial state, renders results after search, expands card on click, shows skeleton while loading, shows "Sonuç bulunamadı" on empty
- `GroceryMain`: new button `btn-market-prices` navigates to `/market-prices`
- `GroceryProducts`: market price indicator appears when query returns data (mock `market-prices` endpoint)
