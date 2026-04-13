# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Macir** is a full-stack grocery store inventory and sales management app. Turkish-localized (timezone: Europe/Istanbul), mobile-first PWA. Designed for greengrocery stores.

- **Backend**: Django 5.2 + DRF, SQLite, session/CSRF auth, WhiteNoise for static files
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
DEBUG=true python manage.py runserver          # Dev server (port 8000) — DEBUG=true required locally
DEBUG=true python manage.py test grocery       # Run all backend tests
DEBUG=true python manage.py test grocery.tests.GroceryAPITest.test_dashboard_today
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py seed_defaults --user <username>  # Seed default Turkish categories/products for a user
```

`DEBUG=true` is required for local commands because `DEBUG` defaults to `false` and the `SECRET_KEY` guard raises `RuntimeError` if the dev placeholder key is used with `DEBUG=false`.

### Docker (full stack)
```bash
docker compose up --build -d   # Runs backend + frontend + nginx (use `docker compose`, not `docker-compose`)
docker compose logs backend    # Check backend startup errors
docker compose restart nginx   # Reload nginx config without full rebuild
```

## Architecture

### Multi-user / Ownership
Every model (`Category`, `Product`, `StockEntry`, `SaleRecord`, `FinanceEntry`, `Debt`, `DebtPayment`) has an `owner` FK to `AUTH_USER_MODEL`. All API views filter by `request.user` — users are fully isolated.

`grocery/signals.py` creates a `StoreProfile` when a new user registers. **New users start with blank products and categories** — the signal no longer auto-seeds defaults. Use `seed_defaults --user <username>` manually if needed.

**Critical for backend tests**: All Category/Product/StockEntry/SaleRecord/FinanceEntry/Debt fixtures need `owner=self.user`. Some test classes still call `.delete()` on Category/Product in `setUp` as a safety measure against future signal changes.

### Frontend Data Flow
- `src/api.ts` — Axios client; automatically extracts CSRF token from cookies and adds `X-CSRFToken` header on every request. Contains the `endpoints` object with all API URLs.
- `src/App.tsx` — Auth guard: checks `/api/auth/status/` on mount, renders login or routed app. All pages are lazy-loaded.
- `src/types.ts` — Shared TypeScript interfaces for all API entities
- `src/utils/marketLogos.ts` — Maps API market names (e.g. `bim`, `a101`, `tarim_kredi`) to logo paths under `public/market-logos/`
- All server state managed via TanStack Query; cache invalidated by queryKey after mutations

### Routes
| Path | Page | Purpose |
|------|------|---------|
| `/` | GroceryMain | Home dashboard with quick stats + recent sales + finance summary |
| `/dashboard` | GroceryDashboard | 7-day chart and detailed reports |
| `/products` | GroceryProducts | Product CRUD with icon upload + market price indicator |
| `/stock/new` | GroceryAddStock | Restock session form |
| `/sales/new` | GroceryRecordSales | POS-style sales entry |
| `/sales/history` | GrocerySalesHistory | Full sale history with date filters + product search |
| `/market-prices` | GroceryMarketPrices | Live market price comparison (proxy to marketfiyati.org.tr) |
| `/finance` | GroceryFinance | Monthly expenses/income + debt tracking |

### Backend API (`/backend/grocery/`)
- `models.py` — Core models: `Category`, `Product`, `StockEntry`/`StockEntryItem`, `SaleRecord`/`SaleItem`, `FinanceEntry`, `Debt`, `DebtPayment`
- `api.py` — DRF generic views + dashboard endpoint; `_annotate_products()` adds `_stock_level` and `_most_recent_purchase_price` as DB annotations (no N+1). `SaleRecordList` orders by `-date, -pk`.
- `serializers.py` — Nested serializers using `transaction.atomic()` for parent+items creation; `SaleRecordSerializer.validate()` checks for negative stock (error messages in Turkish). `SaleItemSerializer` includes `product_name` (read-only via `source='product.name'`).
- `signals.py` — `on_user_created` creates `StoreProfile` only; `seed_defaults()` is available but not called automatically
- `market_prices.py` — `fetch_market_prices(keywords)` pure function (POST to external API, returns cheapest 5 stores sorted ascending). `market_price_search` DRF view at `GET /api/market-prices/search/?q=<keywords>` with 30-min `DatabaseCache` keyed as `market_price:{keywords.lower()}`.

**API prefix**: `/api/grocery/` for domain resources, `/api/auth/` for session management, `/api/market-prices/` for the external price proxy.

**Auth endpoints**: `GET /api/auth/status/`, `GET /api/auth/csrf/`, `POST /api/auth/login/`, `POST /api/auth/logout/`

**Finance/Debt endpoints**:
- `GET/POST /api/grocery/finance/` — lists entries for current month (`?month=YYYY-MM`), triggers lazy recurring creation on GET
- `GET/PUT/DELETE /api/grocery/finance/<pk>/`
- `GET/POST /api/grocery/debts/` — `?active=true` filter; annotated with `remaining_amount`
- `GET/PUT/DELETE /api/grocery/debts/<pk>/`
- `GET/POST /api/grocery/debts/<pk>/payments/`
- `GET/DELETE /api/grocery/debts/<pk>/payments/<pk>/`

### Key Data Patterns
- **Stock level** is computed: `sum(StockEntryItem.quantity) - sum(SaleItem.quantity)` — no stored field. In list/detail views it's an ORM annotation (`_stock_level`); `ProductSerializer` checks `hasattr(obj, '_stock_level')` to use it, falling back to the model property.
- **Dashboard** (`/api/grocery/dashboard/?range=today|week|month`) accepts an optional `?date=YYYY-MM-DD` override (used in tests). Returns `total_sales`, `net_profit`, `items_sold`, `best_sellers`, `low_stock`, `chart` array, `monthly_expenses`, `monthly_income_extra`, `total_debt_remaining`. Always use `today` (not `datetime.now(istanbul)`) when filtering inside the dashboard view so the `?date=` override works in tests.
- **Recurring finance entries**: `_create_missing_recurring(user)` runs on every GET to `/api/grocery/finance/`. Uses `get_or_create` (race-safe) to create a current-month entry from the most recent template per `(category, entry_type)` pair.
- **Debt remaining balance**: `_annotate_debts(qs)` uses `ExpressionWrapper(F('total_amount') - Coalesce(Sum('payments__amount'), 0))`. `DebtSerializer` uses `hasattr` fallback for non-annotated contexts.
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

### Backend Test Patterns
- **Login/lockout tests** (`LoginLockoutTest`): patch `config.urls.LoginRateThrottle.allow_request` to bypass DRF throttle so axes failure limit is reached before rate-limiting kicks in:
  ```python
  self.throttle_patcher = patch('config.urls.LoginRateThrottle.allow_request', return_value=True)
  self.throttle_patcher.start()
  ```
  Also clear `AccessAttempt.objects.all()` in both `setUp` and `tearDown`.

### Market Prices Integration
- External API: `POST https://api.marketfiyati.org.tr/api/v2/search` — CORS-blocked from browser, requires Django proxy
- API returns `marketAdi` as lowercase with underscores: `bim`, `a101`, `migros`, `carrefour`, `tarim_kredi`, `sok`
- `getMarketLogo()` normalizes market names by stripping spaces+underscores and replacing Turkish chars before looking up in `LOGO_MAP`
- Logos live in `frontend/public/market-logos/` and are referenced as `/market-logos/{name}.png`
- The welcome screen on `/market-prices` shows prices for the user's own active products; falls back to default greengrocery items if the product list is empty

### Settings / Config
All configurable via environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | `dev-secret-change-in-production` | Raises `RuntimeError` if unchanged and `DEBUG=false` |
| `DEBUG` | `false` | Set `true` for local dev |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated |
| `EXTRA_ALLOWED_ORIGINS` | `` | Added to `CSRF_TRUSTED_ORIGINS` and `CORS_ALLOWED_ORIGINS` |
| `DB_DIR` | `BASE_DIR` | Path for `db.sqlite3` |
| `HTTPS` | `false` | Set `true` behind TLS — activates secure cookies, HSTS, SSL redirect |
| `ADMIN_URL` | `admin/` | Rename admin path to avoid scanner hits (trailing slash required) |

- CSRF cookie is readable by JS (`CSRF_COOKIE_HTTPONLY = False`)
- Login endpoint is rate-limited to 5/min (nginx) + django-axes locks accounts after 10 failures for 1 hour
- Cache backend is `DatabaseCache` (`django_cache` table) — persists across restarts; created by `createcachetable` in Dockerfile CMD
- `authenticate()` in `api_login` must receive `request._request` (Django `HttpRequest`), not the DRF wrapper, so `AxesMiddleware` can read the `axes_locked_out` flag set by `AxesStandaloneBackend`

### Deployment (Cloudflare Tunnel + Docker)
- Live at `https://macir.ikaganacar.com` via Cloudflare Tunnel → `localhost:25566` → nginx → backend/frontend containers
- nginx binds `0.0.0.0:25566` (not localhost-only) so the cloudflared container can reach it
- `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` trusts Cloudflare's header — without this, `SECURE_SSL_REDIRECT` would loop
- Static files served by WhiteNoise middleware (position: after `SecurityMiddleware`, before others)
- PWA service worker excludes `/yonetim-paneli-x7k2m9` via `navigateFallbackDenylist` so Django admin loads server-rendered
- Dockerfile runs `collectstatic` with `DEBUG=true` to bypass the SECRET_KEY guard at build time
