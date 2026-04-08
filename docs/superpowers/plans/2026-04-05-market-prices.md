# Market Prices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Django proxy endpoint for `marketfiyati.org.tr`, show cheapest market price on each product card, and add a `/market-prices` search page.

**Architecture:** A new `backend/grocery/market_prices.py` module provides `fetch_market_prices()` (pure HTTP function) and a `market_price_search` Django view with 30-min in-process caching. The frontend adds a `marketPrices` endpoint, TS types, a per-product TanStack Query indicator in GroceryProducts, a new GroceryMarketPrices search page, and a navigation button in GroceryMain.

**Tech Stack:** Django 5.2 (LocMemCache, `django.core.cache`), `requests`, React 19, TanStack Query 5, Mantine 8 (Paper, Skeleton, TextInput, Button, Group, Text), `@tabler/icons-react`, Vitest + Testing Library.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `backend/grocery/market_prices.py` | `fetch_market_prices()` + `market_price_search` view |
| Modify | `backend/config/urls.py` | Register `/api/market-prices/search/` route |
| Modify | `backend/grocery/tests.py` | Add market price backend tests |
| Modify | `frontend/src/types.ts` | `MarketStore`, `MarketPriceResult` interfaces |
| Modify | `frontend/src/api.ts` | Add `marketPrices` endpoint |
| Modify | `frontend/src/pages/GroceryProducts.tsx` | Per-product market price indicator |
| Modify | `frontend/src/pages/__tests__/GroceryProducts.test.tsx` | Test for market price indicator |
| Modify | `frontend/src/pages/GroceryMain.tsx` | Add "Piyasa Fiyatları" button |
| Modify | `frontend/src/pages/__tests__/GroceryMain.test.tsx` | Test for new button |
| Create | `frontend/src/pages/GroceryMarketPrices.tsx` | Market prices search page |
| Create | `frontend/src/pages/__tests__/GroceryMarketPrices.test.tsx` | Tests for search page |
| Modify | `frontend/src/App.tsx` | Lazy import + `/market-prices` route |

---

### Task 1: Backend — `fetch_market_prices` pure function

**Files:**
- Create: `backend/grocery/market_prices.py`
- Modify: `backend/grocery/tests.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/grocery/tests.py` at the bottom (after all existing test classes):

```python
from unittest.mock import patch, MagicMock


class FetchMarketPricesTest(TestCase):
    """Tests for the fetch_market_prices pure function."""

    def _mock_response(self, data: dict, status_code: int = 200):
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_resp.json.return_value = data
        mock_resp.raise_for_status.return_value = None
        if status_code >= 400:
            from requests.exceptions import HTTPError
            mock_resp.raise_for_status.side_effect = HTTPError()
        return mock_resp

    def _make_content_item(self, id: str, title: str, brand: str, image_url=None, depots=None):
        if depots is None:
            depots = []
        return {
            "id": id,
            "title": title,
            "brand": brand,
            "imageUrl": image_url,
            "refinedQuantityUnit": None,
            "refinedVolumeOrWeight": None,
            "categories": [],
            "productDepotInfoList": depots,
        }

    def _make_depot(self, market: str, price: float, unit_price: str):
        return {
            "depotId": "1",
            "depotName": market,
            "price": price,
            "unitPrice": unit_price,
            "marketAdi": market,
            "percentage": 0.0,
            "longitude": 0.0,
            "latitude": 0.0,
            "indexTime": "2026-04-05T00:00:00",
        }

    @patch('grocery.market_prices.requests.post')
    def test_returns_parsed_results(self, mock_post):
        depots = [
            self._make_depot('BIM', 25.0, '25,00 TL/kg'),
            self._make_depot('A101', 22.0, '22,00 TL/kg'),
            self._make_depot('SOK', 30.0, '30,00 TL/kg'),
        ]
        item = self._make_content_item('abc', 'Domates', 'BrandX', depots=depots)
        mock_post.return_value = self._mock_response({
            'numberOfFound': 1,
            'searchResultType': 1,
            'content': [item],
        })

        from grocery.market_prices import fetch_market_prices
        results = fetch_market_prices('domates')

        self.assertEqual(len(results), 1)
        r = results[0]
        self.assertEqual(r['id'], 'abc')
        self.assertEqual(r['title'], 'Domates')
        self.assertEqual(r['brand'], 'BrandX')
        self.assertIsNone(r['imageUrl'])
        # sorted ascending by price: A101=22, BIM=25, SOK=30
        self.assertEqual(r['cheapest_stores'][0]['market'], 'A101')
        self.assertAlmostEqual(r['cheapest_stores'][0]['price'], 22.0)
        self.assertEqual(r['cheapest_stores'][0]['unitPrice'], '22,00 TL/kg')

    @patch('grocery.market_prices.requests.post')
    def test_returns_at_most_5_stores(self, mock_post):
        depots = [
            self._make_depot(f'Market{i}', float(10 + i), f'{10+i} TL')
            for i in range(8)
        ]
        item = self._make_content_item('x', 'X', 'Y', depots=depots)
        mock_post.return_value = self._mock_response({
            'numberOfFound': 1, 'searchResultType': 1, 'content': [item],
        })

        from grocery.market_prices import fetch_market_prices
        results = fetch_market_prices('x')
        self.assertLessEqual(len(results[0]['cheapest_stores']), 5)

    @patch('grocery.market_prices.requests.post')
    def test_returns_empty_on_network_error(self, mock_post):
        import requests as req_lib
        mock_post.side_effect = req_lib.exceptions.ConnectionError('fail')

        from grocery.market_prices import fetch_market_prices
        self.assertEqual(fetch_market_prices('anything'), [])

    @patch('grocery.market_prices.requests.post')
    def test_returns_empty_on_http_error(self, mock_post):
        mock_post.return_value = self._mock_response({}, status_code=500)

        from grocery.market_prices import fetch_market_prices
        self.assertEqual(fetch_market_prices('anything'), [])

    @patch('grocery.market_prices.requests.post')
    def test_posts_to_correct_url_with_headers(self, mock_post):
        mock_post.return_value = self._mock_response({
            'numberOfFound': 0, 'searchResultType': 0, 'content': [],
        })

        from grocery.market_prices import fetch_market_prices
        fetch_market_prices('elma')

        call_kwargs = mock_post.call_args
        self.assertIn('https://api.marketfiyati.org.tr/api/v2/search', call_kwargs[0])
        headers = call_kwargs[1]['headers']
        self.assertEqual(headers['content-type'], 'application/json')
        self.assertIn('Mozilla', headers['user-agent'])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery.tests.FetchMarketPricesTest -v 2
```

Expected: `ImportError: No module named 'grocery.market_prices'` or similar failure.

- [ ] **Step 3: Create `backend/grocery/market_prices.py`**

```python
import json

import requests
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

_BASE_URL = "https://api.marketfiyati.org.tr/api/v2/search"
_HEADERS = {
    "cache-control": "no-cache",
    "content-type": "application/json",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
    ),
}
_TIMEOUT = 10


def fetch_market_prices(keywords: str) -> list[dict]:
    try:
        resp = requests.post(
            _BASE_URL,
            headers=_HEADERS,
            data=json.dumps({"keywords": keywords}),
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return []

    results = []
    for item in data.get("content", []):
        depots = item.get("productDepotInfoList", [])
        sorted_depots = sorted(depots, key=lambda d: d.get("price", 0))[:5]
        cheapest_stores = [
            {
                "market": d.get("marketAdi", ""),
                "price": d.get("price", 0),
                "unitPrice": d.get("unitPrice", ""),
            }
            for d in sorted_depots
        ]
        results.append({
            "id": item.get("id", ""),
            "title": item.get("title", ""),
            "brand": item.get("brand", ""),
            "imageUrl": item.get("imageUrl"),
            "cheapest_stores": cheapest_stores,
        })
    return results


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def market_price_search(request):
    keywords = request.query_params.get("q", "").strip()
    if not keywords:
        return Response({"results": [], "error": "missing q"}, status=400)

    cache_key = f"market_price:{keywords.lower()}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response({"results": cached})

    results = fetch_market_prices(keywords)
    cache.set(cache_key, results, timeout=1800)
    return Response({"results": results})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery.tests.FetchMarketPricesTest -v 2
```

Expected: 5 tests, all PASS.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add backend/grocery/market_prices.py backend/grocery/tests.py
git commit -m "feat: add fetch_market_prices function with tests"
```

---

### Task 2: Backend — `market_price_search` view + URL registration

**Files:**
- Modify: `backend/config/urls.py`
- Modify: `backend/grocery/tests.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/grocery/tests.py` after `FetchMarketPricesTest`:

```python
class MarketPriceSearchViewTest(APITestCase):
    """Tests for the market_price_search Django view."""

    def setUp(self):
        self.user = User.objects.create_user(username='mpuser', password='pass')
        self.client.force_authenticate(user=self.user)
        # Clear any cached values between tests
        from django.core.cache import cache as django_cache
        django_cache.clear()

    @patch('grocery.market_prices.fetch_market_prices')
    def test_returns_200_with_results(self, mock_fetch):
        mock_fetch.return_value = [
            {'id': '1', 'title': 'Domates', 'brand': 'X', 'imageUrl': None,
             'cheapest_stores': [{'market': 'BIM', 'price': 20.0, 'unitPrice': '20 TL'}]}
        ]
        response = self.client.get('/api/market-prices/search/?q=domates')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('results', data)
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['title'], 'Domates')

    def test_returns_400_when_q_missing(self):
        response = self.client.get('/api/market-prices/search/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_returns_401_when_unauthenticated(self):
        self.client.logout()
        response = self.client.get('/api/market-prices/search/?q=domates')
        self.assertEqual(response.status_code, 401)

    @patch('grocery.market_prices.fetch_market_prices')
    def test_caches_result_on_second_call(self, mock_fetch):
        mock_fetch.return_value = [
            {'id': '1', 'title': 'Elma', 'brand': 'Y', 'imageUrl': None,
             'cheapest_stores': []}
        ]
        self.client.get('/api/market-prices/search/?q=elma')
        self.client.get('/api/market-prices/search/?q=elma')
        # fetch_market_prices should only be called once — second hit is cached
        mock_fetch.assert_called_once()

    @patch('grocery.market_prices.fetch_market_prices')
    def test_empty_result_is_cached(self, mock_fetch):
        mock_fetch.return_value = []
        self.client.get('/api/market-prices/search/?q=unknown')
        self.client.get('/api/market-prices/search/?q=unknown')
        mock_fetch.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery.tests.MarketPriceSearchViewTest -v 2
```

Expected: `AssertionError: 404 != 200` (route not registered yet).

- [ ] **Step 3: Register the URL in `backend/config/urls.py`**

Add the import after the existing `from grocery.api import grocery_api_urls` line:

```python
from grocery.market_prices import market_price_search
```

Add the path inside `urlpatterns` (before the `static(...)` call):

```python
path('api/market-prices/search/', market_price_search),
```

The final `urlpatterns` list should look like:

```python
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/grocery/', include(grocery_api_urls)),
    path('api/market-prices/search/', market_price_search),
    path('api/auth/status/', auth_status),
    path('api/auth/csrf/', csrf_view),
    path('api/auth/login/', api_login),
    path('api/auth/logout/', api_logout),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```

- [ ] **Step 4: Run all backend tests**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery -v 2
```

Expected: all existing tests + 5 new `MarketPriceSearchViewTest` tests pass. Total should be 28.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add backend/config/urls.py backend/grocery/tests.py
git commit -m "feat: register market_price_search view at /api/market-prices/search/"
```

---

### Task 3: Frontend types and API endpoint

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Add TS interfaces to `frontend/src/types.ts`**

Append after the `SaleRecord` interface (at the end of the file):

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

- [ ] **Step 2: Add endpoint to `frontend/src/api.ts`**

Change the `endpoints` export to:

```ts
export const endpoints = {
  categories:   '/api/grocery/categories/',
  products:     '/api/grocery/products/',
  stockEntries: '/api/grocery/stock-entries/',
  saleRecords:  '/api/grocery/sale-records/',
  dashboard:    '/api/grocery/dashboard/',
  marketPrices: '/api/market-prices/search/',
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/types.ts frontend/src/api.ts
git commit -m "feat: add MarketStore/MarketPriceResult types and marketPrices endpoint"
```

---

### Task 4: GroceryMain — "Piyasa Fiyatları" button

**Files:**
- Modify: `frontend/src/pages/GroceryMain.tsx`
- Modify: `frontend/src/pages/__tests__/GroceryMain.test.tsx`

- [ ] **Step 1: Write the failing test**

In `frontend/src/pages/__tests__/GroceryMain.test.tsx`, add inside the `describe` block at the bottom, after the existing tests:

```ts
it('btn-market-prices navigates to /market-prices', async () => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('dashboard')) return Promise.resolve({ data: mockStats });
    if (url.includes('sale-records')) return Promise.resolve({ data: mockSaleRecords });
    return Promise.resolve({ data: [] });
  });
  renderComponent();
  const btn = await screen.findByTestId('btn-market-prices');
  fireEvent.click(btn);
  expect(mockNavigate).toHaveBeenCalledWith('/market-prices');
});
```

Also update the `endpoints` mock at the top of the file to include `marketPrices`:

```ts
vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  endpoints: {
    dashboard: '/api/grocery/dashboard/',
    saleRecords: '/api/grocery/sale-records/',
    marketPrices: '/api/market-prices/search/',
  },
}));
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryMain --reporter=verbose 2>&1 | tail -20
```

Expected: `Unable to find an element by: [data-testid="btn-market-prices"]`.

- [ ] **Step 3: Add the button to `GroceryMain.tsx`**

First, add `IconShoppingBag` to the icon imports. Current import block begins with:
```tsx
import {
  IconAlertTriangle,
  IconChartBar,
  IconClipboardList,
  IconPackage,
  IconShoppingCart,
} from '@tabler/icons-react';
```

Change to:
```tsx
import {
  IconAlertTriangle,
  IconChartBar,
  IconClipboardList,
  IconPackage,
  IconShoppingBag,
  IconShoppingCart,
} from '@tabler/icons-react';
```

Then find the two-column SimpleGrid of tertiary buttons in the JSX. It ends with `</SimpleGrid>`. Add the new button immediately after that closing tag:

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

- [ ] **Step 4: Run frontend tests for GroceryMain**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryMain --reporter=verbose 2>&1 | tail -20
```

Expected: all GroceryMain tests pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryMain.tsx frontend/src/pages/__tests__/GroceryMain.test.tsx
git commit -m "feat: add Piyasa Fiyatları navigation button to GroceryMain"
```

---

### Task 5: GroceryProducts — market price indicator

**Files:**
- Modify: `frontend/src/pages/GroceryProducts.tsx`
- Modify: `frontend/src/pages/__tests__/GroceryProducts.test.tsx`

- [ ] **Step 1: Write the failing test**

In `frontend/src/pages/__tests__/GroceryProducts.test.tsx`, update the `endpoints` mock to include `marketPrices`:

```ts
vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  endpoints: {
    products: '/api/grocery/products/',
    categories: '/api/grocery/categories/',
    marketPrices: '/api/market-prices/search/',
  },
}));
```

Then add this test inside the describe block (after the existing tests):

```ts
it('shows cheapest market price indicator on product card', async () => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('categories')) return Promise.resolve({ data: mockCategories });
    if (url.includes('market-prices')) return Promise.resolve({
      data: {
        results: [
          {
            id: '1',
            title: 'Domates',
            brand: 'BrandX',
            imageUrl: null,
            cheapest_stores: [
              { market: 'BIM', price: 18.5, unitPrice: '18,50 TL/kg' },
            ],
          },
        ],
      },
    });
    return Promise.resolve({ data: mockProducts });
  });

  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MantineProvider>
          <Notifications />
          <GroceryProducts />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );

  await screen.findByText('Domates');
  await waitFor(() => {
    expect(screen.getByTestId('market-price-1')).toBeInTheDocument();
  });
  expect(screen.getByTestId('market-price-1')).toHaveTextContent('BIM');
  expect(screen.getByTestId('market-price-1')).toHaveTextContent('18.50');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryProducts --reporter=verbose 2>&1 | tail -20
```

Expected: `Unable to find an element by: [data-testid="market-price-1"]`.

- [ ] **Step 3: Add the market price indicator to `GroceryProducts.tsx`**

Add the import for `useQuery` if not present (it is already present). Add `MarketPriceResult` to the types import at the top:

```tsx
import type { MarketPriceResult, Product } from '../types';
```

Inside the product list map (after the existing `Text` with category/sell price), add a sub-component rendered inline. The product card map is:

```tsx
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
      ...
```

Replace the inner `<div>` block with:

```tsx
<div>
  <Text fw={600} c={product.is_active ? undefined : 'dimmed'}>
    {product.name} {!product.is_active && '(pasif)'}
  </Text>
  <Text size='xs' c='dimmed'>
    {product.category_name} · ₺{product.sell_price}/{product.unit}
  </Text>
  <MarketPriceIndicator productName={product.name} productPk={product.pk} />
</div>
```

Add `MarketPriceIndicator` as a module-level component (before the `export default function GroceryProducts` line):

```tsx
function MarketPriceIndicator({ productName, productPk }: { productName: string; productPk: number }) {
  const { data } = useQuery<{ results: MarketPriceResult[] }>({
    queryKey: ['market-price', productName],
    queryFn: () =>
      api.get(endpoints.marketPrices, { params: { q: productName } }).then((r) => r.data),
    staleTime: 30 * 60 * 1000,
  });

  const cheapest = data?.results?.[0]?.cheapest_stores?.[0];
  if (!cheapest) return null;

  return (
    <Text size='xs' c='dimmed' data-testid={`market-price-${productPk}`}>
      📍 {cheapest.market.toUpperCase()} ₺{cheapest.price.toFixed(2)}
    </Text>
  );
}
```

Also ensure `endpoints` is imported in GroceryProducts. It already is via `import { api, endpoints } from '../api';`.

- [ ] **Step 4: Run all frontend tests**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryProducts --reporter=verbose 2>&1 | tail -30
```

Expected: all GroceryProducts tests pass including the new indicator test.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryProducts.tsx frontend/src/pages/__tests__/GroceryProducts.test.tsx
git commit -m "feat: add market price indicator to GroceryProducts card"
```

---

### Task 6: GroceryMarketPrices page

**Files:**
- Create: `frontend/src/pages/GroceryMarketPrices.tsx`
- Create: `frontend/src/pages/__tests__/GroceryMarketPrices.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/__tests__/GroceryMarketPrices.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
  },
  endpoints: {
    marketPrices: '/api/market-prices/search/',
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryMarketPrices from '../GroceryMarketPrices';

const mockResults = [
  {
    id: '1',
    title: 'Domates',
    brand: 'BrandA',
    imageUrl: null,
    cheapest_stores: [
      { market: 'BIM', price: 18.5, unitPrice: '18,50 TL/kg' },
      { market: 'A101', price: 20.0, unitPrice: '20,00 TL/kg' },
    ],
  },
  {
    id: '2',
    title: 'Elma',
    brand: 'BrandB',
    imageUrl: null,
    cheapest_stores: [],
  },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryMarketPrices />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryMarketPrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial helper text when no search submitted', () => {
    renderComponent();
    expect(screen.getByText('Bir ürün adı yazın ve fiyatları karşılaştırın')).toBeInTheDocument();
  });

  it('shows skeleton while loading', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {})); // never resolves
    renderComponent();
    const input = screen.getByPlaceholderText('Ürün adı yazın...');
    fireEvent.change(input, { target: { value: 'domates' } });
    fireEvent.click(screen.getByText('Ara'));
    await waitFor(() => {
      expect(document.querySelector('.mantine-Skeleton-root')).toBeInTheDocument();
    });
  });

  it('renders results after search', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
      expect(screen.getByText('Elma')).toBeInTheDocument();
    });
  });

  it('shows "Sonuç bulunamadı" on empty results', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [] } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'xyz' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await waitFor(() => {
      expect(screen.getByText('Sonuç bulunamadı')).toBeInTheDocument();
    });
  });

  it('expands card on click to show store prices', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText('Ürün adı yazın...'), {
      target: { value: 'domates' },
    });
    fireEvent.click(screen.getByText('Ara'));
    await screen.findByText('Domates');

    // BIM price not visible initially
    expect(screen.queryByText('BIM')).not.toBeInTheDocument();

    // click to expand
    fireEvent.click(screen.getByTestId('result-card-1'));
    expect(screen.getByText('BIM')).toBeInTheDocument();
    expect(screen.getByText('18.50')).toBeInTheDocument();
  });

  it('back button calls navigate(-1)', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('triggers search on Enter key', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: mockResults } });
    renderComponent();
    const input = screen.getByPlaceholderText('Ürün adı yazın...');
    fireEvent.change(input, { target: { value: 'domates' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => {
      expect(screen.getByText('Domates')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryMarketPrices --reporter=verbose 2>&1 | tail -20
```

Expected: `Cannot find module '../GroceryMarketPrices'`.

- [ ] **Step 3: Create `frontend/src/pages/GroceryMarketPrices.tsx`**

```tsx
import {
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
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
import type { MarketPriceResult } from '../types';

export default function GroceryMarketPrices() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery<{ results: MarketPriceResult[] }>({
    queryKey: ['market-prices', submittedQuery],
    queryFn: () =>
      api.get(endpoints.marketPrices, { params: { q: submittedQuery } }).then((r) => r.data),
    enabled: !!submittedQuery,
    staleTime: 30 * 60 * 1000,
  });

  function submit() {
    const trimmed = query.trim();
    if (trimmed) setSubmittedQuery(trimmed);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const results = data?.results ?? [];

  return (
    <Box maw={480} mx='auto'>
      {/* Sticky header */}
      <Box
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          background: '#fff',
          borderBottom: '1px solid #e8f5e9',
        }}
        px='md'
        py='sm'
      >
        <Group>
          <Button
            variant='subtle'
            color='green'
            px={8}
            onClick={() => navigate(-1)}
            data-testid='btn-back'
          >
            <IconArrowLeft size={20} />
          </Button>
          <Title order={5}>Piyasa Fiyatları</Title>
        </Group>
      </Box>

      <Stack p='md' gap='sm'>
        {/* Search bar */}
        <Group gap='xs'>
          <TextInput
            flex={1}
            placeholder='Ürün adı yazın...'
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <Button color='green' onClick={submit}>
            Ara
          </Button>
        </Group>

        {/* States */}
        {!submittedQuery && (
          <Text c='dimmed' ta='center' mt='xl'>
            Bir ürün adı yazın ve fiyatları karşılaştırın
          </Text>
        )}

        {isLoading && (
          <>
            <Skeleton height={56} radius='md' />
            <Skeleton height={56} radius='md' />
            <Skeleton height={56} radius='md' />
          </>
        )}

        {!isLoading && submittedQuery && results.length === 0 && (
          <Text c='dimmed' ta='center' mt='xl'>
            Sonuç bulunamadı
          </Text>
        )}

        {!isLoading && results.map((result) => {
          const isExpanded = expanded.has(result.id);
          return (
            <Paper
              key={result.id}
              withBorder
              p='sm'
              style={{ border: '1px solid #e8f5e9', cursor: 'pointer' }}
              onClick={() => toggleExpand(result.id)}
              data-testid={`result-card-${result.id}`}
            >
              <Group justify='space-between'>
                <div>
                  <Text fw={600}>{result.title}</Text>
                  {result.brand && (
                    <Text size='xs' c='dimmed'>{result.brand}</Text>
                  )}
                </div>
                {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
              </Group>

              {isExpanded && result.cheapest_stores.length > 0 && (
                <Stack gap={4} mt='xs'>
                  <SimpleGrid cols={3} spacing='xs'>
                    <Text size='xs' fw={600} c='dimmed'>Market</Text>
                    <Text size='xs' fw={600} c='dimmed'>Fiyat</Text>
                    <Text size='xs' fw={600} c='dimmed'>Birim Fiyat</Text>
                  </SimpleGrid>
                  {result.cheapest_stores.map((store, idx) => (
                    <SimpleGrid key={idx} cols={3} spacing='xs'>
                      <Text size='xs'>{store.market}</Text>
                      <Text size='xs'>{store.price.toFixed(2)}</Text>
                      <Text size='xs' c='dimmed'>{store.unitPrice}</Text>
                    </SimpleGrid>
                  ))}
                </Stack>
              )}
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 4: Run GroceryMarketPrices tests**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryMarketPrices --reporter=verbose 2>&1 | tail -30
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryMarketPrices.tsx frontend/src/pages/__tests__/GroceryMarketPrices.test.tsx
git commit -m "feat: add GroceryMarketPrices search page with tests"
```

---

### Task 7: Wire route in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add lazy import and route**

In `frontend/src/App.tsx`, add after the existing `GrocerySalesHistory` lazy import:

```tsx
const GroceryMarketPrices = lazy(() => import('./pages/GroceryMarketPrices'));
```

Add the route inside `<Routes>` after the `/sales/history` route:

```tsx
<Route path='/market-prices' element={<GroceryMarketPrices />} />
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full frontend test suite**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test 2>&1 | tail -20
```

Expected: all tests pass (no regressions).

- [ ] **Step 4: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/App.tsx
git commit -m "feat: register /market-prices route in App.tsx"
```

---

### Task 8: Full stack smoke test

- [ ] **Step 1: Run all backend tests**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery -v 2 2>&1 | tail -10
```

Expected: 28 tests, 0 failures.

- [ ] **Step 2: Run all frontend tests**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test 2>&1 | tail -10
```

Expected: all tests pass, 0 failures.

- [ ] **Step 3: Build frontend**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds with no TypeScript errors.
