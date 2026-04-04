# Quick Add Product — Design Spec

**Date:** 2026-04-04
**File:** `frontend/src/pages/GroceryProducts.tsx`

## Goal

Make adding products faster for greengrocers by offering a scrollable grid of ~83 pre-defined Turkish produce items. Selecting a preset pre-fills the existing form so the user only needs to enter the price.

## Flow

1. User taps **"Ürün Ekle"** button (existing, unchanged)
2. **Picker modal** opens — "Hızlı Ürün Ekle"
3. User taps a preset card → picker closes, **form modal** opens pre-filled
4. User enters price → taps **Kaydet**

Alternatively, user taps **"Manuel ekle →"** at the bottom of picker → form modal opens blank (existing behaviour).

## Picker Modal

- Title: **"Hızlı Ürün Ekle"**
- 4-column `SimpleGrid` of compact cards, full-height scrollable `ScrollArea`
- Each card: large emoji (top) + Turkish name (bottom, `size='xs'`)
- Cards for products already in the system (case-insensitive name match against `products` query) are **dimmed** (`opacity: 0.35`) and **non-clickable**
- Footer row: `"Manuel ekle →"` subtle button — opens blank form, same as before
- Close (×) dismisses without action

## Form Pre-fill (on preset tap)

| Field | Value |
|-------|-------|
| Ad | Preset name (e.g. "Domates") |
| Birim | Preset unit (`kg` or `adet`) |
| Kategori | Matched by preset's category string ("Sebze" / "Meyve" / "Diğer") against live `categories` query — `null` if no match |
| Satış Fiyatı | **Empty / undefined** — user must fill in |
| Stok Uyarı Eşiği | `2` for kg items, `1` for adet items |
| Son Kullanma Notu | `''` |

The form modal title shows **"Yeni Ürün"** (unchanged). Save button remains disabled until all required fields are filled (name is pre-filled, price must be entered by user).

## Preset Data (~83 items)

Defined as a `const` array in the same file, above the component. Each entry:
```ts
{ name: string; emoji: string; unit: 'kg' | 'adet'; category: 'Sebze' | 'Meyve' | 'Diğer' }
```

### Sebze (41 items)
Domates🍅 Salatalık🥒 Kırmızı Biber🫑 Sivri Biber🫑 Dolmalık Biber🫑 Acı Biber🌶️ Patlıcan🍆 Havuç🥕 Patates🥔 Tatlı Patates🍠 Soğan🧅 Taze Soğan🌱 Sarımsak🧄 Ispanak🥬 Marul🥗 Buz Marul🥬 Roka🌿 Tere🌿 Semizotu🌿 Maydanoz🌿 Dereotu🌿 Nane🌿 Kabak🫛 Pırasa🌿 Kereviz🌿 Brokoli🥦 Karnabahar🥦 Lahana🥬 Kırmızı Lahana🥬 Fasulye🫘 Barbunya🫘 Börülce🫘 Bezelye🫛 Bamya🌿 Pancar🟣 Turp🌰 Enginar🌸 Kuşkonmaz🌿 Rezene🌿 Zencefil🫚 Asma Yaprağı🍃

### Meyve (32 items)
Elma🍎 Armut🍐 Portakal🍊 Mandalina🍊 Greyfurt🍊 Limon🍋 Muz🍌 Üzüm🍇 Çilek🍓 Kiraz🍒 Vişne🍒 Şeftali🍑 Nektarin🍑 Kayısı🍑 Erik🍑 Kavun🍈 Karpuz🍉 Nar🔴 İncir🟣 Kivi🥝 Avokado🥑 Dut🫐 Ahududu🫐 Böğürtlen🫐 Yaban Mersini🫐 Ananas🍍 Mango🥭 Trabzon Hurması🟠 Ayva🟡 Malta Eriği🟡 Hurma🟤 Muşmula🟡

### Diğer (10 items)
Ceviz🌰 Fındık🌰 Badem🌰 Antep Fıstığı🟢 Kestane🌰 Nohut🫘 Mercimek🫘 Ay Çekirdeği🌻 Kabak Çekirdeği🟢 Kuru İncir🟤 Kuru Kayısı🟠 Kuru Üzüm🟤 Kuru Erik🟣

## State Management

Two modal states, both managed with `useDisclosure`:
- `pickerOpened` / `openPicker` / `closePicker` — controls the preset picker
- `opened` / `open` / `close` — controls the existing form modal (unchanged)

Opening picker does not interfere with form modal state. Both can't be open simultaneously by design (picker close → form open).

## Implementation Scope

- Modify: `frontend/src/pages/GroceryProducts.tsx` only
- No backend changes
- No new files
- Existing form mutation, validation, and error handling unchanged

## Testing

Add to existing `GroceryProducts.test.tsx`:
- Picker modal opens on "Ürün Ekle" click
- Tapping a preset closes picker and opens form with pre-filled name
- Already-added products are dimmed in the picker
- "Manuel ekle" opens blank form
