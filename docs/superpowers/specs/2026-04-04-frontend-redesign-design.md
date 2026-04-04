# Frontend Redesign — Design Spec

**Date:** 2026-04-04
**Scope:** Full frontend UI/UX overhaul — visual theme, Turkish localization, and page-level UX improvements
**Approach:** Theme-first, then page-by-page in order of daily usage importance
**Tech stack unchanged:** React 19, Mantine 8, TanStack Query 5, React Router 6, Axios

---

## Goals

- Serve local greengrocers: simple, fast, touch-friendly
- Primary usage: daily sales entry + weekly stock restocking
- 80% mobile use, 20% laptop
- Fully Turkish UI (all labels, placeholders, buttons, toasts, errors)
- Fresh & natural visual style (greens, earthy tones)

---

## 1. Theme & Visual Language

### Color Palette
- **Primary:** Mantine `green` — main actions, active states, borders, buttons
- **Accent:** Mantine `lime` — highlights, badges, success states
- **Warning:** Mantine `orange` — low stock alerts, price cost indicators
- **Page background:** `#f9faf7` (warm off-white, not stark white)
- **Card background:** white with green-tinted border `#e8f5e9`
- **Text primary:** `#1a1a1a`; secondary: `#555`

### Typography
- Base font size: 17px (up from default 16px) for readability in shop conditions
- Prices rendered in a distinct weight; profit values in green, costs neutral
- Section headers: bold, clearly sized, not decorative

### Layout Principles
- Minimum tap target: 48px height on all interactive elements
- Cards: 16–20px padding, 12px border radius
- Sticky page header (title + back arrow) on all pages
- Sticky footer for primary action buttons (Kaydet, Tamamla)
- Max content width: 480px centered on desktop; full-width on mobile

### Global Mantine Theme Override
Set in `App.tsx` via `createTheme()`:
- `primaryColor: 'green'`
- `defaultRadius: 'md'`
- `fontFamily`: system sans-serif stack
- `colors`: no custom palette needed beyond Mantine defaults

---

## 2. Ana Sayfa (Home / Launchpad)

### Purpose
Today's key numbers at a glance + fast navigation to daily tasks.

### Layout
```
Header: 🌿 Macır | today's date (right-aligned)
↓
2-column stat cards: [Bugün Satış] [Kâr]
↓
Orange alert bar: "X üründe stok azaldı" (only if low stock > 0, taps → Stok Ekle)
↓
Full-width primary button: 🛒 Satış Yap (green, large)
Full-width secondary button: 📦 Stok Ekle
Half-width pair: 📋 Ürünler | 📊 Raporlar
↓
Small text link at bottom: Çıkış Yap
```

### Behavior
- Stat cards are tappable — navigate to Raporlar page
- Low stock alert bar taps directly into Stok Ekle
- "Satış Yap" is the largest, most prominent element — the primary daily action
- Removed: "Tekrar Et" / repeat last sale button, detailed dashboard button (redundant)

### Data
- `GET /api/grocery/dashboard/?range=today&date=YYYY-MM-DD`
- Shows `total_sales`, `net_profit`, `low_stock` count

---

## 3. Satış Sayfası (Sales Recording)

### Purpose
Fast product selection for daily sales. Designed for small catalogs where the user knows their products.

### Layout
```
Sticky header: ← Satış Yap | [N ürün] badge
↓
Horizontal scrollable category chips (Tümü + each category)
↓
3-column product card grid (sorted by best-seller rank, then alphabetical)
↓
[Search TextInput — below grid, fallback for large catalogs]
↓
Sticky footer (hidden until ≥1 item selected):
  Toplam: ₺X.XX  |  [Tamamla →]
```

### Product Card
- Shows: product icon (if set), product name, unit, sell price from DB
- Selected state: green border + green checkmark overlay + quantity badge
- Low stock indicator: small orange dot on card (does not block selection)
- No hardcoded or placeholder prices — all from API

### Interactions
- Tap unselected card → opens quantity modal
- Tap selected card → reopens modal to edit quantity
- Quantity modal: unit-appropriate presets + NumpadInput (reused component)
- Sell price editable per-sale in modal
- "Tamamla" submits to `POST /api/grocery/sale-records/`
- On success: redirect to Ana Sayfa with success toast

### Removed
- Popular items paper (best-seller sort replaces it)
- Recent items paper (redundant)
- Separate low-stock warning section (replaced by per-card dot indicator)

---

## 4. Stok Ekleme Sayfası (Weekly Restock)

### Purpose
Weekly bulk restock entry. User sees all products pre-listed; fills in only what they actually bought.

### Layout
```
Sticky header: ← Stok Ekle
↓
Date picker row: 📅 Tarih: [4 Nisan 2026] (defaults to today)
↓
Scrollable product list grouped by category:
  — CATEGORY NAME ———————————————
  [Product Row]
  [Product Row]
  — NEXT CATEGORY ————————————————
  ...
↓
Sticky footer:
  [N ürün eklendi]  |  [Kaydet]
```

### Product Row
- Shows: product name, current stock level badge (green if ok, orange if low)
- Two inputs inline: Miktar (quantity) + Alış Fiyatı (purchase price) with unit label
- Tapping quantity or price field opens NumpadInput modal
- Row is visually neutral until filled; filled rows get a subtle green background

### Behavior
- All active products shown — no need to search/add
- Products with low stock shown with orange warning badge
- Only rows with quantity > 0 are included in submission payload
- "Kaydet" disabled until at least 1 product has quantity > 0
- Footer count updates in real-time as user fills rows
- On success: redirect to Ana Sayfa with success toast

### Removed
- Search-to-add flow
- Recent items / quick-add buttons
- Low-stock-only filter (full list is shown; low stock items are highlighted inline)

---

## 5. Raporlar Sayfası (Dashboard)

### Purpose
Occasional analytics view. Same page structure as current but cleaner, bigger chart, better hierarchy.

### Layout
```
Sticky header: ← Raporlar
Segmented control: [Bugün] [Hafta] [Ay]
↓
2-column stat cards: [Satış] [Kâr]
Full-width stat card: [Satılan Ürün Adedi]
↓
Section: "7 Günlük Satış"
  BarChart — height 320px (up from current), Turkish date labels (GG Ay format)
  Tooltip shows ₺ formatted values
↓
Section: "En Çok Satanlar"
  Ranked list: rank number | product name | revenue | quantity
↓
Section: "Stok Azalanlar" (only rendered if low_stock.length > 0)
  Each item: product name | current stock | threshold
```

### Changes from Current
- Chart height 250px → 320px
- Turkish date formatting on X-axis
- Stats in larger, cleaner cards
- Low stock section conditionally rendered (not always shown as empty)
- All labels/headers in Turkish

---

## 6. Ürünler Sayfası (Products)

### Purpose
Infrequent product catalog management. No structural changes — visual alignment only.

### Changes
- Green theme applied to all buttons and active form states
- All UI text translated to Turkish:
  - Labels: Ad, Kategori, Birim, Satış Fiyatı, Stok Uyarı Eşiği, Son Kullanma Notu, İkon
  - Buttons: Ürün Ekle, Kaydet, İptal
  - Placeholders, toasts, and error messages
- Product list cards match new card style (rounded, green-tinted border)
- No layout or structural changes

---

## 7. Giriş Sayfası (Login)

### Changes
- Green theme (button, logo accent)
- Text translated: Kullanıcı Adı, Şifre, Giriş Yap
- Keep existing centered card layout

---

## Implementation Order

1. Global Mantine theme + Turkish translations (shared foundation)
2. Satış Sayfası (highest daily impact)
3. Stok Ekleme Sayfası (weekly impact)
4. Ana Sayfa (launchpad cleanup)
5. Raporlar Sayfası (visual polish)
6. Ürünler + Giriş (translation + theme only)

---

## Out of Scope

- Backend changes (no API modifications)
- New features beyond what's described
- Internationalization system (i18n library) — direct Turkish strings are sufficient
- Dark mode
- PWA manifest changes
