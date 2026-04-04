# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Macir** is a full-stack grocery store inventory and sales management app. Turkish-localized (timezone: Europe/Istanbul), mobile-first PWA.

- **Backend**: Django 5.2 + DRF, SQLite, session/CSRF auth
- **Frontend**: React 19 + TypeScript, Vite 6, Mantine 8, TanStack Query 5, React Router 6

## Development Commands

### Frontend (`/frontend`)
```bash
npm run dev      # Vite dev server with hot reload + API proxy to Django
npm run build    # tsc -b && vite build (type check + production bundle)
npm run preview  # Preview production build
```

### Backend (`/backend`)
```bash
python manage.py runserver          # Dev server
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

### Docker (full stack)
```bash
docker-compose up --build   # Runs backend + frontend + nginx on port 81
```

## Architecture

### Frontend Data Flow
- `src/api.ts` — Axios client; automatically extracts CSRF token from cookies and adds `X-CSRFToken` header on every request
- `src/App.tsx` — Auth guard: checks `/api/auth/status/` on mount, renders login or routed app
- All server state managed via TanStack Query; cache invalidated by queryKey after mutations

### Routes
| Path | Page | Purpose |
|------|------|---------|
| `/` | GroceryMain | Home dashboard with quick stats |
| `/dashboard` | GroceryDashboard | 7-day chart and detailed reports |
| `/products` | GroceryProducts | Product CRUD with icon upload |
| `/stock/new` | GroceryAddStock | Restock session form |
| `/sales/new` | GroceryRecordSales | POS-style sales entry |

### Backend API (`/backend/grocery/`)
- `models.py` — Core models: `Category`, `Product`, `StockEntry`/`StockEntryItem`, `SaleRecord`/`SaleItem`
- `api.py` — DRF generic views + dashboard endpoint with bulk aggregation queries
- `serializers.py` — Nested serializers using `transaction.atomic()` for parent+items creation

**API prefix**: `/api/grocery/` for domain resources, `/api/auth/` for session management.

### Key Data Patterns
- **Stock level** is computed: `sum(StockEntryItem.quantity) - sum(SaleItem.quantity)` — no stored field
- **Dashboard** (`/api/grocery/dashboard/?range=today|week|month`) uses 3 bulk queries (not N+1) for all product stock levels
- **Profit** uses subqueries to find the latest purchase price per product
- Both `StockEntry` and `SaleRecord` are parent entities created atomically with their line items

### Frontend UI Patterns
- `NumpadInput` component (`src/components/NumpadInput.tsx`) — mobile-friendly decimal input, max 3 decimal places
- Mantine `useForm` for all forms; Mantine notifications for success/error feedback
- Modal-based pickers with preset quick-entry buttons for mobile UX
- Sticky footer action buttons pattern on mobile pages
