# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Macir** is a full-stack grocery store inventory and sales management app. Turkish-localized (timezone: Europe/Istanbul), mobile-first PWA. Designed for greengrocery stores.

- **Backend**: Django 5.2 + DRF, SQLite, session/CSRF auth
- **Frontend**: React 19 + TypeScript, Vite 6, Mantine 8, TanStack Query 5, React Router 6

## Development Commands

### Frontend (`/frontend`)
```bash
npm run dev          # Vite dev server with hot reload + API proxy to Django
npm run build        # tsc -b && vite build (type check + production bundle)
npm run test         # Vitest run (single pass)
npm run test:watch   # Vitest watch mode
# Run a single test file:
npm run test -- GroceryMain --reporter=verbose
```

### Backend (`/backend`)
```bash
python manage.py runserver          # Dev server (port 8000)
python manage.py test grocery       # Run all backend tests
python manage.py test grocery.tests.GroceryAPITest.test_dashboard_today  # Single test
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_defaults --user <username>  # Seed default Turkish categories/products for a user
```

### Docker (full stack)
```bash
docker compose up --build -d   # Runs backend + frontend + nginx (use `docker compose`, not `docker-compose`)
docker compose logs backend    # Check backend startup errors
```

## Architecture

### Multi-user / Ownership
Every model (`Category`, `Product`, `StockEntry`, `SaleRecord`) has an `owner` FK to `AUTH_USER_MODEL`. All API views filter by `request.user` — users are fully isolated. A `post_save` signal (`grocery/signals.py`) auto-seeds default Turkish categories and products when a new user is created (idempotent).

**Critical for backend tests**: `User.objects.create_user()` triggers the signal, seeding ~20 products and 3 categories. Test fixtures that create users must clear seeded data in `setUp`:
```python
Product.objects.filter(owner=self.user).delete()
Category.objects.filter(owner=self.user).delete()
```
Also, all Category/Product/StockEntry/SaleRecord fixtures need `owner=self.user`.

### Frontend Data Flow
- `src/api.ts` — Axios client; automatically extracts CSRF token from cookies and adds `X-CSRFToken` header on every request. Contains the `endpoints` object with all API URLs.
- `src/App.tsx` — Auth guard: checks `/api/auth/status/` on mount, renders login or routed app. All pages are lazy-loaded.
- `src/types.ts` — Shared TypeScript interfaces for all API entities
- `src/utils/marketLogos.ts` — Maps API market names (e.g. `bim`, `a101`, `tarim_kredi`) to logo paths under `public/market-logos/`
- All server state managed via TanStack Query; cache invalidated by queryKey after mutations

### Routes
| Path | Page | Purpose |
|------|------|---------|
| `/` | GroceryMain | Home dashboard with quick stats + recent sales |
| `/dashboard` | GroceryDashboard | 7-day chart and detailed reports |
| `/products` | GroceryProducts | Product CRUD with icon upload + market price indicator |
| `/stock/new` | GroceryAddStock | Restock session form |
| `/sales/new` | GroceryRecordSales | POS-style sales entry |
| `/sales/history` | GrocerySalesHistory | Full sale history with date filters + product search |
| `/market-prices` | GroceryMarketPrices | Live market price comparison (proxy to marketfiyati.org.tr) |

### Backend API (`/backend/grocery/`)
- `models.py` — Core models: `Category`, `Product`, `StockEntry`/`StockEntryItem`, `SaleRecord`/`SaleItem`
- `api.py` — DRF generic views + dashboard endpoint; `_annotate_products()` adds `_stock_level` and `_most_recent_purchase_price` as DB annotations (no N+1). `SaleRecordList` orders by `-date, -pk`.
- `serializers.py` — Nested serializers using `transaction.atomic()` for parent+items creation; `SaleRecordSerializer.validate()` checks for negative stock (error messages in Turkish). `SaleItemSerializer` includes `product_name` (read-only via `source='product.name'`).
- `signals.py` — `on_user_created` seeds defaults; `seed_defaults()` is idempotent
- `market_prices.py` — `fetch_market_prices(keywords)` pure function (POST to external API, returns cheapest 5 stores sorted ascending). `market_price_search` DRF view at `GET /api/market-prices/search/?q=<keywords>` with 30-min `LocMemCache` keyed as `market_price:{keywords.lower()}`. Requires `requests` package (in `requirements.txt`).

**API prefix**: `/api/grocery/` for domain resources, `/api/auth/` for session management, `/api/market-prices/` for the external price proxy.

**Auth endpoints**: `GET /api/auth/status/`, `GET /api/auth/csrf/`, `POST /api/auth/login/`, `POST /api/auth/logout/`

### Key Data Patterns
- **Stock level** is computed: `sum(StockEntryItem.quantity) - sum(SaleItem.quantity)` — no stored field. In list/detail views it's an ORM annotation (`_stock_level`); `ProductSerializer` checks `hasattr(obj, '_stock_level')` to use it, falling back to the model property.
- **Dashboard** (`/api/grocery/dashboard/?range=today|week|month`) accepts an optional `?date=YYYY-MM-DD` override (used in tests). Returns `total_sales`, `net_profit`, `items_sold`, `best_sellers`, `low_stock`, and a `chart` array (last 7 days).
- **Profit** uses a subquery to find the latest purchase price per product at the time of dashboard computation.
- Both `StockEntry` and `SaleRecord` are parent entities created atomically with their line items; line items are **immutable after creation** (update strips `items`).
- `ProductList` supports query params: `?active=false` (include inactive), `?category=<pk>`, `?search=<str>`

### Frontend UI Patterns
- `NumpadInput` component (`src/components/NumpadInput.tsx`) — mobile-friendly decimal input, max 3 decimal places
- Mantine `useForm` for all forms; Mantine notifications for success/error feedback
- Modal-based pickers with preset quick-entry buttons for mobile UX
- Sticky header pattern (not footer) on detail/list pages; back button uses `navigate(-1)`
- `recharts` used for the 7-day sales bar chart on the dashboard
- Helper functions (date formatters, total calculators) are defined at **module level**, not inside the component function — follow this pattern when adding helpers

### Istanbul Timezone Pattern
Never use `new Date().toISOString()` for local dates — it returns UTC which is wrong during 00:00–02:59 Istanbul time (UTC+3). Use:
```ts
new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
// Returns 'YYYY-MM-DD' in Istanbul local time
```

### Frontend Test Patterns
- `vitest.config.ts` has `fakeTimers: { shouldAdvanceTime: true }` — required so `vi.useFakeTimers()` doesn't block `waitFor` polling
- Mock `../../utils/marketLogos` in any test involving market price UI to avoid asset path issues:
  ```ts
  vi.mock('../../utils/marketLogos', () => ({
    getMarketLogo: (market: string) => `/market-logos/${market.toLowerCase()}.png`,
    KNOWN_MARKETS: ['bim', 'a101', 'migros', 'carrefour'],
  }));
  ```
- Mock `api.get` with `mockImplementation` routing by URL when a component fires multiple different queries

### Market Prices Integration
- External API: `POST https://api.marketfiyati.org.tr/api/v2/search` — CORS-blocked from browser, requires Django proxy
- API returns `marketAdi` as lowercase with underscores: `bim`, `a101`, `migros`, `carrefour`, `tarim_kredi`, `sok`
- `getMarketLogo()` normalizes market names by stripping spaces+underscores and replacing Turkish chars before looking up in `LOGO_MAP`
- Logos live in `frontend/public/market-logos/` and are referenced as `/market-logos/{name}.png`
- The welcome screen on `/market-prices` shows prices for the user's own active products; falls back to default greengrocery items if the product list is empty

### Settings / Config
- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `DB_DIR`, `EXTRA_ALLOWED_ORIGINS` are all configurable via environment variables
- CSRF cookie is readable by JS (`CSRF_COOKIE_HTTPONLY = False`)
- Login endpoint is rate-limited to 5/minute; anonymous endpoints to 60/minute
