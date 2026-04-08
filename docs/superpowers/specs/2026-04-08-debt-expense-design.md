# Debt & Expense Tracking — Design Spec

**Date:** 2026-04-08  
**Status:** Approved

## Overview

Add a finance tracking module to Macir so store owners can record regular expenses, unexpected income, recurring monthly payments, and loans with remaining balance tracking. Fully per-user isolated, consistent with existing ownership patterns.

---

## Data Models

### `FinanceEntry`

Covers regular expenses and unexpected income, with optional monthly auto-recurrence.

| Field | Type | Notes |
|-------|------|-------|
| `owner` | FK → User (CASCADE) | multi-user isolation |
| `category` | CharField(100) | free text e.g. "Kira", "Elektrik", "İşçi Maaşı" |
| `entry_type` | CharField choices | `expense` or `income` |
| `amount` | DecimalField(10,2) | always positive |
| `date` | DateField | Istanbul local date |
| `is_recurring` | BooleanField default False | monthly auto-create |
| `notes` | TextField blank/default='' | optional |

Ordering: `['-date', '-pk']`

### `Debt`

Represents a loan or long-term liability with payment tracking.

| Field | Type | Notes |
|-------|------|-------|
| `owner` | FK → User (CASCADE) | |
| `name` | CharField(200) | e.g. "Banka Kredisi", "Tedarikçi Borcu" |
| `total_amount` | DecimalField(10,2) | original loan amount |
| `monthly_payment` | DecimalField(10,2) | expected monthly payment amount |
| `start_date` | DateField | when the loan started |
| `is_active` | BooleanField default True | False = paid off / archived |
| `notes` | TextField blank/default='' | |

Remaining balance = `total_amount - sum(DebtPayment.amount)` (computed via DB annotation).

### `DebtPayment`

Individual payment event against a Debt.

| Field | Type | Notes |
|-------|------|-------|
| `debt` | FK → Debt (CASCADE) | |
| `amount` | DecimalField(10,2) | |
| `date` | DateField | |
| `notes` | TextField blank/default='' | |

Ordering: `['-date', '-pk']`

---

## Backend API

All endpoints require authentication. All views filter by `request.user`.

### FinanceEntry

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/grocery/finance/` | List entries; optional `?month=YYYY-MM` filter |
| POST | `/api/grocery/finance/` | Create entry |
| PATCH | `/api/grocery/finance/<pk>/` | Update entry |
| DELETE | `/api/grocery/finance/<pk>/` | Delete entry |

**Lazy recurring creation:** On every `GET /api/grocery/finance/`, before returning results, the backend checks all `is_recurring=True` entries for the current Istanbul month. If any are missing (no entry with same category+entry_type for current month), it creates them with `date = first day of current month`. This runs synchronously in the view — no cron required.

**Recurring template identification:** A recurring entry acts as its own template. The latest instance of each `(category, entry_type, is_recurring=True)` tuple is used to seed next month's entry. `DELETE` removes only the specific instance.

### Debts

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/grocery/debts/` | List active debts with `remaining_amount`; `?include_inactive=true` for all |
| POST | `/api/grocery/debts/` | Create debt |
| PATCH | `/api/grocery/debts/<pk>/` | Update debt (e.g. mark inactive) |

`remaining_amount` is a DB annotation: `total_amount - Coalesce(Sum(payments__amount), 0)`.

### Debt Payments

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/grocery/debts/<pk>/payments/` | List payments for a debt |
| POST | `/api/grocery/debts/<pk>/payments/` | Add a payment |
| DELETE | `/api/grocery/debts/<pk>/payments/<payment_pk>/` | Delete a payment |

### Dashboard Extension

Existing `GET /api/grocery/dashboard/` gains three new fields:

```json
{
  "monthly_expenses": 4500.00,
  "monthly_income_extra": 200.00,
  "total_debt_remaining": 35000.00
}
```

- `monthly_expenses`: sum of `FinanceEntry(entry_type='expense')` for current Istanbul month
- `monthly_income_extra`: sum of `FinanceEntry(entry_type='income')` for current Istanbul month  
- `total_debt_remaining`: sum of `remaining_amount` across all active Debts for this user

---

## Frontend

### New Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/finance` | `GroceryFinance` | Finance hub: expenses + debts |

Added to `App.tsx` as lazy-loaded route.

### GroceryMain Changes

1. **Dashboard summary card** — new row below the existing 2-column stats grid:
   - `Aylık Gider` — monthly expense total (from dashboard API)
   - `Kalan Borç` — total debt remaining (from dashboard API)
   - Tapping navigates to `/finance`

2. **New button** — "Borçlar & Giderler" button (same style as "Piyasa Fiyatları"), navigating to `/finance`

### GroceryFinance Page

Two-tab layout (Mantine `Tabs`):

**Tab 1 — Giderler / Gelirler**
- Month navigator: `< Nisan 2026 >` arrows to change month
- List of FinanceEntry records for selected month, grouped by category, showing amount and type badge
- "Ekle" button → modal with fields: category (TextInput), type (SegmentedControl: Gider/Gelir), amount (NumpadInput), date (defaults today), recurring toggle, notes
- Each row: swipe-delete or delete icon button
- Empty state: "Bu ay kayıt yok"

**Tab 2 — Borçlar**
- List of active Debts, each showing:
  - Name + remaining/total (e.g. "₺32,000 / ₺50,000 kaldı")
  - Progress bar: paid percentage
  - Monthly payment amount
- Tap to expand: shows payment history list + "Ödeme Ekle" button
- "Ödeme Ekle" → modal: amount (pre-filled with `monthly_payment`), date, notes
- "Borç Ekle" button → modal: name, total amount, monthly payment, start date, notes
- "Kapat" action on a debt → sets `is_active=False`

### API Endpoints Added to `src/api.ts`

```ts
finance: '/api/grocery/finance/',
debts: '/api/grocery/debts/',
```

### Types Added to `src/types.ts`

```ts
interface FinanceEntry {
  pk: number;
  category: string;
  entry_type: 'expense' | 'income';
  amount: string;
  date: string;
  is_recurring: boolean;
  notes: string;
}

interface Debt {
  pk: number;
  name: string;
  total_amount: string;
  monthly_payment: string;
  start_date: string;
  is_active: boolean;
  remaining_amount: string;
  notes: string;
}

interface DebtPayment {
  pk: number;
  debt: number;
  amount: string;
  date: string;
  notes: string;
}
```

---

## Error Handling

- Payment that would make `remaining_amount` go negative: backend returns 400 with Turkish error message
- Recurring entry creation failures (e.g. duplicate): silently skipped (idempotent)
- All mutations use Mantine notifications for success/error feedback

## Testing

**Backend:**
- `FinanceEntryAPITest`: CRUD, ownership isolation, recurring auto-create logic, month filter
- `DebtAPITest`: CRUD, `remaining_amount` annotation, `include_inactive` param
- `DebtPaymentAPITest`: add/delete payment, overpayment validation
- `DashboardDebtTest`: new dashboard fields correct for current month

**Frontend:**
- `GroceryFinance.test.tsx`: renders tabs, adds expense entry, adds income, recurring toggle visible, month navigation, add debt, add payment, progress bar reflects remaining
- `GroceryMain.test.tsx`: finance summary card visible, button navigates to `/finance`

---

## Out of Scope

- Recurring entries with frequency other than monthly (weekly, yearly)
- Partial delete of recurring series (deleting "this and all future")
- Debt interest calculation
- Export to CSV/PDF
