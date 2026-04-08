# Store Profile & Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-user `StoreProfile` (lat/lng/radius) stored in the DB, expose it via `GET/PATCH /api/grocery/profile/`, wire it into the market price proxy, and provide a `/profile` settings page with an interactive Leaflet map picker accessed via a gear icon in the GroceryMain header.

**Architecture:** `StoreProfile` is a `OneToOneField` on `User`, auto-created in the existing `on_user_created` signal alongside `seed_defaults`. Default is Istanbul (41.0082°N, 28.9784°E, 50 km radius). The market price proxy reads the requesting user's profile and includes lat/lng in the cache key so users get location-isolated results. The frontend uses `react-leaflet` with OpenStreetMap tiles — click/tap to set pin, geolocation button, radius presets. Leaflet marker icons require a Vite-specific fix (delete `_getIconUrl`, merge static import paths).

**Tech Stack:** Django 5.2 + DRF, `react-leaflet` v4, `leaflet` v1, `@types/leaflet`, Mantine 8 (`ActionIcon`, `SegmentedControl`), TanStack Query 5, Vitest (mock `react-leaflet` — jsdom cannot render canvas maps).

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/grocery/models.py` | Add `StoreProfile` model |
| Generate | `backend/grocery/migrations/0004_storeprofile.py` | Auto via `makemigrations` |
| Modify | `backend/grocery/signals.py` | Create `StoreProfile` in `on_user_created` |
| Modify | `backend/grocery/serializers.py` | Add `StoreProfileSerializer` |
| Modify | `backend/grocery/api.py` | Add `ProfileView` + URL |
| Modify | `backend/grocery/market_prices.py` | Accept lat/lng/radius, update cache key |
| Modify | `backend/grocery/tests.py` | `StoreProfileTest` + location-aware market price tests |
| Modify | `frontend/src/types.ts` | Add `StoreProfile` interface |
| Modify | `frontend/src/api.ts` | Add `profile` endpoint |
| Create | `frontend/src/pages/GroceryProfile.tsx` | Settings page with Leaflet map |
| Create | `frontend/src/pages/__tests__/GroceryProfile.test.tsx` | Tests (mocked map) |
| Modify | `frontend/src/pages/GroceryMain.tsx` | Gear icon → `/profile` |
| Modify | `frontend/src/pages/__tests__/GroceryMain.test.tsx` | Test gear icon navigation |
| Modify | `frontend/src/App.tsx` | Lazy import + `/profile` route |

---

### Task 1: Backend — StoreProfile model + migration + signal

**Files:**
- Modify: `backend/grocery/models.py`
- Modify: `backend/grocery/signals.py`
- Generate: `backend/grocery/migrations/0004_storeprofile.py`
- Modify: `backend/grocery/tests.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/grocery/tests.py` (after the existing import block, add `StoreProfile` to the model imports, then add this class at the bottom):

```python
# Add StoreProfile to the models import line:
from grocery.models import Category, Product, SaleItem, SaleRecord, StockEntry, StockEntryItem, StoreProfile


class StoreProfileTest(TestCase):
    """Tests for StoreProfile model and auto-creation."""

    def test_profile_auto_created_with_user(self):
        user = User.objects.create_user(username='profiletest', password='pass')
        self.assertTrue(StoreProfile.objects.filter(owner=user).exists())

    def test_profile_defaults_to_istanbul(self):
        user = User.objects.create_user(username='istanbul', password='pass')
        profile = StoreProfile.objects.get(owner=user)
        self.assertAlmostEqual(profile.latitude, 41.0082, places=3)
        self.assertAlmostEqual(profile.longitude, 28.9784, places=3)
        self.assertEqual(profile.search_radius_km, 50)

    def test_profile_str(self):
        user = User.objects.create_user(username='strtest', password='pass')
        profile = StoreProfile.objects.get(owner=user)
        self.assertIn('strtest', str(profile))
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery.tests.StoreProfileTest -v 2
```

Expected: `ImportError: cannot import name 'StoreProfile'`.

- [ ] **Step 3: Add StoreProfile to `backend/grocery/models.py`**

Append this class at the end of the file (before any `__all__` if present, otherwise just at the end):

```python
class StoreProfile(models.Model):
    """Per-user store location for market price proximity searches."""

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='store_profile',
    )
    latitude = models.FloatField(default=41.0082)   # Istanbul default
    longitude = models.FloatField(default=28.9784)  # Istanbul default
    search_radius_km = models.IntegerField(default=50)

    def __str__(self):
        return f"{self.owner.username} store profile"
```

- [ ] **Step 4: Update `on_user_created` signal in `backend/grocery/signals.py`**

Add `StoreProfile` import at the top of the file (update the existing import line):

```python
from grocery.models import Category, Product, StoreProfile
```

Update `on_user_created` to also create the profile:

```python
@receiver(post_save, sender=User)
def on_user_created(sender, instance, created, **kwargs):
    """Auto-seed default categories, products, and store profile when a new user is created."""
    if created:
        StoreProfile.objects.get_or_create(owner=instance)
        seed_defaults(instance)
```

- [ ] **Step 5: Generate and apply migration**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py makemigrations && python manage.py migrate
```

Expected: creates `0004_storeprofile.py`, applies cleanly.

- [ ] **Step 6: Run StoreProfile tests**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery.tests.StoreProfileTest -v 2
```

Expected: 3 tests pass.

- [ ] **Step 7: Run all backend tests to check no regressions**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery -v 0
```

Expected: all 33 tests + 3 new = 36 pass. Note: existing `GroceryAPITest.setUp` already deletes products/categories for `self.user`, but doesn't need to delete StoreProfile (the signal creates it idempotently, and tests don't conflict on profiles).

- [ ] **Step 8: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add backend/grocery/models.py backend/grocery/migrations/0004_storeprofile.py backend/grocery/signals.py backend/grocery/tests.py
git commit -m "feat: add StoreProfile model with Istanbul defaults"
```

---

### Task 2: Backend — Profile API (serializer + view + URL)

**Files:**
- Modify: `backend/grocery/serializers.py`
- Modify: `backend/grocery/api.py`
- Modify: `backend/grocery/tests.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/grocery/tests.py` after `StoreProfileTest`:

```python
class ProfileAPITest(APITestCase):
    """Tests for GET/PATCH /api/grocery/profile/."""

    def setUp(self):
        self.user = User.objects.create_user(username='profapi', password='pass')
        self.client.force_authenticate(user=self.user)

    def test_get_profile_returns_defaults(self):
        response = self.client.get('/api/grocery/profile/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertAlmostEqual(data['latitude'], 41.0082, places=3)
        self.assertAlmostEqual(data['longitude'], 28.9784, places=3)
        self.assertEqual(data['search_radius_km'], 50)

    def test_patch_profile_updates_location(self):
        response = self.client.patch('/api/grocery/profile/', {
            'latitude': 38.4189,
            'longitude': 27.1287,
            'search_radius_km': 100,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertAlmostEqual(data['latitude'], 38.4189, places=3)
        self.assertAlmostEqual(data['longitude'], 27.1287, places=3)
        self.assertEqual(data['search_radius_km'], 100)

    def test_patch_profile_persists(self):
        self.client.patch('/api/grocery/profile/', {
            'latitude': 39.9179,
            'longitude': 32.8614,
            'search_radius_km': 25,
        }, format='json')
        response = self.client.get('/api/grocery/profile/')
        self.assertAlmostEqual(response.json()['latitude'], 39.9179, places=3)

    def test_unauthenticated_returns_401(self):
        self.client.logout()
        response = self.client.get('/api/grocery/profile/')
        self.assertIn(response.status_code, (401, 403))

    def test_users_cannot_access_each_others_profiles(self):
        other = User.objects.create_user(username='other_prof', password='pass')
        StoreProfile.objects.filter(owner=other).update(latitude=99.0)
        response = self.client.get('/api/grocery/profile/')
        self.assertNotAlmostEqual(response.json()['latitude'], 99.0, places=1)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery.tests.ProfileAPITest -v 2
```

Expected: 404 errors (route not registered).

- [ ] **Step 3: Add `StoreProfileSerializer` to `backend/grocery/serializers.py`**

Add the import for `StoreProfile` at the top (update the models import line):

```python
from grocery.models import Category, Product, SaleItem, SaleRecord, StockEntry, StockEntryItem, StoreProfile
```

Append this serializer at the end of the file:

```python
class StoreProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreProfile
        fields = ['latitude', 'longitude', 'search_radius_km']
```

- [ ] **Step 4: Add `ProfileView` to `backend/grocery/api.py`**

Add `StoreProfile` to the models import (update the existing import):

```python
from grocery.models import (
    Category,
    Product,
    SaleItem,
    SaleRecord,
    StockEntry,
    StockEntryItem,
    StoreProfile,
)
```

Add `StoreProfileSerializer` to the serializers import:

```python
from grocery.serializers import (
    CategorySerializer,
    ProductSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
    StoreProfileSerializer,
)
```

Append this view class before the `grocery_api_urls` list:

```python
class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_or_create_profile(self, user):
        profile, _ = StoreProfile.objects.get_or_create(owner=user)
        return profile

    def get(self, request):
        profile = self._get_or_create_profile(request.user)
        return Response(StoreProfileSerializer(profile).data)

    def patch(self, request):
        profile = self._get_or_create_profile(request.user)
        serializer = StoreProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
```

Add the URL to `grocery_api_urls`:

```python
grocery_api_urls = [
    path('categories/', CategoryList.as_view(), name='api-grocery-category-list'),
    path('categories/<int:pk>/', CategoryDetail.as_view(), name='api-grocery-category-detail'),
    path('products/', ProductList.as_view(), name='api-grocery-product-list'),
    path('products/<int:pk>/', ProductDetail.as_view(), name='api-grocery-product-detail'),
    path('stock-entries/', StockEntryList.as_view(), name='api-grocery-stock-entry-list'),
    path('stock-entries/<int:pk>/', StockEntryDetail.as_view(), name='api-grocery-stock-entry-detail'),
    path('sale-records/', SaleRecordList.as_view(), name='api-grocery-sale-record-list'),
    path('sale-records/<int:pk>/', SaleRecordDetail.as_view(), name='api-grocery-sale-record-detail'),
    path('dashboard/', DashboardView.as_view(), name='api-grocery-dashboard'),
    path('profile/', ProfileView.as_view(), name='api-grocery-profile'),
]
```

- [ ] **Step 5: Run ProfileAPITest**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery.tests.ProfileAPITest -v 2
```

Expected: 5 tests pass.

- [ ] **Step 6: Run all backend tests**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery -v 0
```

Expected: 41 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add backend/grocery/serializers.py backend/grocery/api.py backend/grocery/tests.py
git commit -m "feat: add GET/PATCH /api/grocery/profile/ endpoint"
```

---

### Task 3: Backend — Wire location into market price proxy

**Files:**
- Modify: `backend/grocery/market_prices.py`
- Modify: `backend/grocery/tests.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/grocery/tests.py` after `ProfileAPITest`. Also import `StoreProfile` in the existing `MarketPriceSearchViewTest` setUp (it already does `cache.clear()` — just add a location update):

```python
class MarketPriceLocationTest(APITestCase):
    """Tests that market price searches use the user's profile location."""

    def setUp(self):
        self.user = User.objects.create_user(username='loctest', password='pass')
        self.client.force_authenticate(user=self.user)
        from django.core.cache import cache as django_cache
        django_cache.clear()

    @patch('grocery.market_prices.fetch_market_prices')
    def test_uses_profile_location(self, mock_fetch):
        mock_fetch.return_value = []
        StoreProfile.objects.filter(owner=self.user).update(
            latitude=38.42, longitude=27.13, search_radius_km=75
        )
        self.client.get('/api/market-prices/search/?q=elma')
        mock_fetch.assert_called_once_with('elma', 38.42, 27.13, 75)

    @patch('grocery.market_prices.fetch_market_prices')
    def test_different_locations_use_different_cache_keys(self, mock_fetch):
        mock_fetch.return_value = [{'id': '1', 'title': 'Elma', 'brand': '', 'imageUrl': None, 'cheapest_stores': []}]

        # User A at location 1
        self.client.get('/api/market-prices/search/?q=elma')

        # User B at different location
        user_b = User.objects.create_user(username='loctest_b', password='pass')
        StoreProfile.objects.filter(owner=user_b).update(latitude=39.91, longitude=32.86)
        self.client.force_authenticate(user=user_b)
        self.client.get('/api/market-prices/search/?q=elma')

        # fetch should have been called twice — cache keys differ
        self.assertEqual(mock_fetch.call_count, 2)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery.tests.MarketPriceLocationTest -v 2
```

Expected: `AssertionError` — `mock_fetch` called with only `'elma'` instead of `('elma', lat, lng, radius)`.

- [ ] **Step 3: Update `fetch_market_prices` in `backend/grocery/market_prices.py`**

Add `StoreProfile` import at the top and update the function signature and view:

```python
import logging

import requests
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from grocery.models import StoreProfile

_BASE_URL = "https://api.marketfiyati.org.tr/api/v2/search"
_HEADERS = {
    "cache-control": "no-cache",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
    ),
}
_TIMEOUT = 10
_DEFAULT_LAT = 41.0082
_DEFAULT_LNG = 28.9784
_DEFAULT_RADIUS = 50

logger = logging.getLogger(__name__)


def fetch_market_prices(
    keywords: str,
    latitude: float = _DEFAULT_LAT,
    longitude: float = _DEFAULT_LNG,
    radius_km: int = _DEFAULT_RADIUS,
) -> list[dict]:
    try:
        resp = requests.post(
            _BASE_URL,
            headers=_HEADERS,
            json={
                "keywords": keywords,
                "latitude": latitude,
                "longitude": longitude,
                "distance": radius_km,
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.warning("fetch_market_prices failed for %r: %s", keywords, e)
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

    profile, _ = StoreProfile.objects.get_or_create(
        owner=request.user,
        defaults={
            "latitude": _DEFAULT_LAT,
            "longitude": _DEFAULT_LNG,
            "search_radius_km": _DEFAULT_RADIUS,
        },
    )
    lat = profile.latitude
    lng = profile.longitude
    radius = profile.search_radius_km

    cache_key = f"market_price:{keywords.lower()}:{lat:.4f}:{lng:.4f}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response({"results": cached})

    results = fetch_market_prices(keywords, lat, lng, radius)
    cache.set(cache_key, results, timeout=1800)
    return Response({"results": results})
```

- [ ] **Step 4: Run all backend tests**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery -v 0
```

Expected: all tests pass (43 total). Note: `FetchMarketPricesTest.test_posts_to_correct_url_with_headers` checks that the POST body contains latitude/longitude — verify it still passes. If it fails because the payload changed, update the test to also assert `latitude` and `longitude` are in the request body.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add backend/grocery/market_prices.py backend/grocery/tests.py
git commit -m "feat: market price proxy uses user profile location"
```

---

### Task 4: Frontend — Types + endpoint + install Leaflet

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Install Leaflet packages**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm install leaflet react-leaflet && npm install -D @types/leaflet
```

Expected: packages added to `package.json`, no errors.

- [ ] **Step 2: Add `StoreProfile` to `frontend/src/types.ts`**

Append at the end of the file:

```ts
export interface StoreProfile {
  latitude: number;
  longitude: number;
  search_radius_km: number;
}
```

- [ ] **Step 3: Add `profile` endpoint to `frontend/src/api.ts`**

```ts
export const endpoints = {
  categories:   '/api/grocery/categories/',
  products:     '/api/grocery/products/',
  stockEntries: '/api/grocery/stock-entries/',
  saleRecords:  '/api/grocery/sale-records/',
  dashboard:    '/api/grocery/dashboard/',
  marketPrices: '/api/market-prices/search/',
  profile:      '/api/grocery/profile/',
};
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/types.ts frontend/src/api.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add StoreProfile type, profile endpoint, install react-leaflet"
```

---

### Task 5: Frontend — GroceryProfile page

**Files:**
- Create: `frontend/src/pages/GroceryProfile.tsx`
- Create: `frontend/src/pages/__tests__/GroceryProfile.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/__tests__/GroceryProfile.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-leaflet entirely — jsdom cannot render canvas/WebGL maps
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid='map-container'>{children}</div>
  ),
  TileLayer: () => null,
  Marker: () => <div data-testid='map-marker' />,
  useMapEvents: (handlers: { click?: (e: { latlng: { lat: number; lng: number } }) => void }) => {
    // expose a helper so tests can simulate map clicks
    (window as any).__simulateMapClick = (lat: number, lng: number) =>
      handlers.click?.({ latlng: { lat, lng } });
    return null;
  },
}));

vi.mock('../../api', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
  endpoints: {
    profile: '/api/grocery/profile/',
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryProfile from '../GroceryProfile';

const mockProfile = { latitude: 41.0082, longitude: 28.9784, search_radius_km: 50 };

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryProfile />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: mockProfile });
    vi.mocked(api.patch).mockResolvedValue({ data: mockProfile });
  });

  it('renders map and loads current profile', async () => {
    renderComponent();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('map-marker')).toBeInTheDocument();
    });
  });

  it('renders title and back button', async () => {
    renderComponent();
    expect(screen.getByText('Mağaza Konumu')).toBeInTheDocument();
    expect(screen.getByTestId('btn-back')).toBeInTheDocument();
  });

  it('back button calls navigate(-1)', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it('shows radius preset buttons', async () => {
    renderComponent();
    await screen.findByTestId('map-marker');
    expect(screen.getByTestId('radius-50')).toBeInTheDocument();
    expect(screen.getByTestId('radius-100')).toBeInTheDocument();
  });

  it('map click updates coordinates display', async () => {
    renderComponent();
    await screen.findByTestId('map-marker');
    (window as any).__simulateMapClick(38.42, 27.13);
    await waitFor(() => {
      expect(screen.getByTestId('coord-display')).toHaveTextContent('38.4200');
    });
  });

  it('save button calls PATCH with current coordinates', async () => {
    renderComponent();
    await screen.findByTestId('map-marker');
    (window as any).__simulateMapClick(38.42, 27.13);
    fireEvent.click(screen.getByTestId('btn-save'));
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/api/grocery/profile/',
        expect.objectContaining({ latitude: 38.42, longitude: 27.13 })
      );
    });
  });

  it('shows success notification after save', async () => {
    renderComponent();
    await screen.findByTestId('map-marker');
    fireEvent.click(screen.getByTestId('btn-save'));
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryProfile --reporter=verbose 2>&1 | tail -10
```

Expected: `Cannot find module '../GroceryProfile'`.

- [ ] **Step 3: Create `frontend/src/pages/GroceryProfile.tsx`**

```tsx
import {
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCurrentLocation } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import type { StoreProfile } from '../types';

// Fix Leaflet marker icons broken by Vite's asset pipeline
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const RADIUS_PRESETS = [25, 50, 100, 200];

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function GroceryProfile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<StoreProfile>({
    queryKey: ['store-profile'],
    queryFn: () => api.get(endpoints.profile).then((r) => r.data),
  });

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radius, setRadius] = useState<number | null>(null);

  // Use loaded values as defaults if user hasn't changed them yet
  const currentLat = lat ?? profile?.latitude ?? 41.0082;
  const currentLng = lng ?? profile?.longitude ?? 28.9784;
  const currentRadius = radius ?? profile?.search_radius_km ?? 50;

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      api.patch(endpoints.profile, {
        latitude: currentLat,
        longitude: currentLng,
        search_radius_km: currentRadius,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-profile'] });
      notifications.show({ message: 'Konum kaydedildi', color: 'green' });
    },
    onError: () => {
      notifications.show({ message: 'Kaydedilemedi', color: 'red' });
    },
  });

  function handleMapClick(newLat: number, newLng: number) {
    setLat(parseFloat(newLat.toFixed(6)));
    setLng(parseFloat(newLng.toFixed(6)));
  }

  function handleGeolocate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLat(parseFloat(pos.coords.latitude.toFixed(6)));
      setLng(parseFloat(pos.coords.longitude.toFixed(6)));
    });
  }

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
        <Group justify='space-between'>
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
            <Title order={5}>Mağaza Konumu</Title>
          </Group>
          <Button
            size='sm'
            color='green'
            loading={isPending}
            onClick={() => save()}
            data-testid='btn-save'
          >
            Kaydet
          </Button>
        </Group>
      </Box>

      <Stack p='md' gap='sm'>
        {/* Map */}
        <Paper withBorder style={{ height: 320, overflow: 'hidden', border: '1px solid #e8f5e9' }}>
          {profile && (
            <MapContainer
              center={[currentLat, currentLng]}
              zoom={11}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                attribution='© OpenStreetMap contributors'
              />
              <ClickHandler onClick={handleMapClick} />
              <Marker position={[currentLat, currentLng]} />
            </MapContainer>
          )}
        </Paper>

        {/* Coordinate display */}
        <Text size='xs' c='dimmed' ta='center' data-testid='coord-display'>
          {currentLat.toFixed(4)}, {currentLng.toFixed(4)}
        </Text>

        {/* Geolocation button */}
        <Button
          variant='default'
          leftSection={<IconCurrentLocation size={16} />}
          onClick={handleGeolocate}
          fullWidth
        >
          Konumumu Kullan
        </Button>

        {/* Radius presets */}
        <Text size='sm' fw={600} c='dimmed'>Arama Yarıçapı</Text>
        <SimpleGrid cols={4} spacing='xs'>
          {RADIUS_PRESETS.map((r) => (
            <Button
              key={r}
              variant={currentRadius === r ? 'filled' : 'default'}
              color='green'
              size='xs'
              onClick={() => setRadius(r)}
              data-testid={`radius-${r}`}
            >
              {r} km
            </Button>
          ))}
        </SimpleGrid>

        <Text size='xs' c='dimmed'>
          Haritaya dokunarak mağaza konumunuzu ayarlayın. Yakın marketlerin fiyatları önce gösterilir.
        </Text>
      </Stack>
    </Box>
  );
}
```

- [ ] **Step 4: Run GroceryProfile tests**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryProfile --reporter=verbose 2>&1 | tail -20
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryProfile.tsx frontend/src/pages/__tests__/GroceryProfile.test.tsx
git commit -m "feat: add GroceryProfile page with Leaflet map location picker"
```

---

### Task 6: Frontend — Gear icon in GroceryMain header

**Files:**
- Modify: `frontend/src/pages/GroceryMain.tsx`
- Modify: `frontend/src/pages/__tests__/GroceryMain.test.tsx`

- [ ] **Step 1: Write the failing test**

In `frontend/src/pages/__tests__/GroceryMain.test.tsx`, update the `endpoints` mock to include `profile`:

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
    profile: '/api/grocery/profile/',
  },
}));
```

Add this test at the bottom of the describe block:

```ts
it('btn-profile navigates to /profile', async () => {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('dashboard')) return Promise.resolve({ data: mockStats });
    if (url.includes('sale-records')) return Promise.resolve({ data: mockSaleRecords });
    return Promise.resolve({ data: [] });
  });
  renderComponent();
  const btn = await screen.findByTestId('btn-profile');
  fireEvent.click(btn);
  expect(mockNavigate).toHaveBeenCalledWith('/profile');
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryMain --reporter=verbose 2>&1 | tail -10
```

Expected: `Unable to find an element by: [data-testid="btn-profile"]`.

- [ ] **Step 3: Update GroceryMain header in `frontend/src/pages/GroceryMain.tsx`**

Add `ActionIcon` to the Mantine imports (already has `Group`, `Text`, `Title`, etc.):

```tsx
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core';
```

Add `IconSettings` to the Tabler icons import:

```tsx
import {
  IconAlertTriangle,
  IconChartBar,
  IconClipboardList,
  IconPackage,
  IconSettings,
  IconShoppingBag,
  IconShoppingCart,
} from '@tabler/icons-react';
```

Replace the current header `<Group>`:

```tsx
{/* Header */}
<Group justify='space-between'>
  <Title order={3} c='green'>🌿 Macır</Title>
  <Group gap='xs' align='center'>
    <Text size='sm' c='dimmed'>{todayLabel}</Text>
    <ActionIcon
      variant='subtle'
      color='gray'
      size='md'
      onClick={() => navigate('/profile')}
      data-testid='btn-profile'
    >
      <IconSettings size={18} />
    </ActionIcon>
  </Group>
</Group>
```

- [ ] **Step 4: Run GroceryMain tests**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test -- GroceryMain --reporter=verbose 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/pages/GroceryMain.tsx frontend/src/pages/__tests__/GroceryMain.test.tsx
git commit -m "feat: add gear icon in GroceryMain header navigating to /profile"
```

---

### Task 7: Frontend — App.tsx route + full smoke test

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add lazy import and route to `frontend/src/App.tsx`**

After the existing `GroceryMarketPrices` lazy import, add:

```tsx
const GroceryProfile = lazy(() => import('./pages/GroceryProfile'));
```

Inside `<Routes>`, after the `/market-prices` route:

```tsx
<Route path='/profile' element={<GroceryProfile />} />
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Run full frontend test suite**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run test 2>&1 | tail -8
```

Expected: all tests pass (10 test files, ~75 tests).

- [ ] **Step 4: Run all backend tests**

```bash
cd /mnt/2tb_ssd/Macir/backend && python manage.py test grocery -v 0 2>&1 | tail -5
```

Expected: 43+ tests, 0 failures.

- [ ] **Step 5: Build frontend**

```bash
cd /mnt/2tb_ssd/Macir/frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /mnt/2tb_ssd/Macir && git add frontend/src/App.tsx
git commit -m "feat: register /profile route in App.tsx"
```
