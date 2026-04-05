# Per-User Data Isolation — Design Spec
**Date:** 2026-04-05
**Status:** Approved

## Problem

All users (ika, umut, …) currently share one global dataset. A user logging in sees every other user's products, stock, and sales.

## Goal

Each user owns their data independently. New users get default categories and products auto-seeded on account creation so they can start immediately.

---

## Architecture

### Owner FK on top-level models

Add `owner = ForeignKey(settings.AUTH_USER_MODEL, on_delete=CASCADE)` to:
- `Category`
- `Product`
- `StockEntry`
- `SaleRecord`

`StockEntryItem` and `SaleItem` are children — they are automatically isolated through their parent's FK. No changes needed on child models.

All FK fields are non-nullable. The migration populates existing rows with the first superuser (ika).

### API view scoping

Every DRF view overrides `get_queryset()` to return only the current user's rows:

```python
def get_queryset(self):
    return Model.objects.filter(owner=self.request.user)
```

Create operations inject the owner via `perform_create`:

```python
def perform_create(self, serializer):
    serializer.save(owner=self.request.user)
```

`StockEntrySerializer` and `SaleRecordSerializer` already use `transaction.atomic()` for nested creation — owner is set on the parent only.

### Auto-seed on new user creation

A `post_save` signal on Django's `User` model triggers `_seed_defaults(user)` when `created=True`.

`_seed_defaults(user)` creates:
- **3 categories**: Sebze (order 1), Meyve (order 2), Diğer (order 3)
- **20 products** (same list as the `seed` management command) with `sell_price=0` and their configured `low_stock_threshold`. Users fill in actual prices before use.

No stock entries or sales are created — those start empty for every new user.

Signal is registered in `grocery/apps.py` via `ready()`.

### Existing data migration

Migration `0003`:
1. Add `owner` nullable to all four models.
2. Populate `owner_id` for all existing rows with the pk of the first superuser.
3. Alter `owner` to non-nullable.

### Seed management command update

`python manage.py seed --user <username>` — creates demo stock entries and sales for the given user. Defaults to first superuser if `--user` is omitted. Skips categories and products (already created by the signal).

---

## Default Products List

| Name | Category | Unit | Low Stock Threshold | Default Price |
|------|----------|------|-------------------|---------------|
| Domates | Sebze | kg | 5 | 0 |
| Salatalık | Sebze | kg | 3 | 0 |
| Kırmızı Biber | Sebze | kg | 3 | 0 |
| Patlıcan | Sebze | kg | 2 | 0 |
| Patates | Sebze | kg | 10 | 0 |
| Soğan | Sebze | kg | 5 | 0 |
| Havuç | Sebze | kg | 3 | 0 |
| Ispanak | Sebze | kg | 2 | 0 |
| Marul | Sebze | kg | 2 | 0 |
| Elma | Meyve | kg | 5 | 0 |
| Portakal | Meyve | kg | 5 | 0 |
| Muz | Meyve | kg | 3 | 0 |
| Limon | Meyve | kg | 2 | 0 |
| Üzüm | Meyve | kg | 2 | 0 |
| Kivi | Meyve | kg | 2 | 0 |
| Ceviz | Diğer | kg | 1 | 0 |
| Nohut | Diğer | kg | 2 | 0 |
| Mercimek | Diğer | kg | 2 | 0 |
| Ay Çekirdeği | Diğer | kg | 1 | 0 |
| Kuru İncir | Diğer | kg | 1 | 0 |

---

## What Does NOT Change

- Frontend: zero changes — scoping is entirely server-side.
- Auth flow: no changes.
- `SaleItem`, `StockEntryItem`: no changes.
- `_annotate_products()` in `api.py`: no changes (subqueries already scope to product FK).
- Negative stock validation in `SaleRecordSerializer`: no changes.

---

## Migration Strategy

1. Write migration with two RunSQL steps (nullable → populate → non-nullable) plus AlterField.
2. Existing ika data stays intact.
3. Umut gets auto-seeded (default products/categories) on next login — this happens via the signal which fires on `User.objects.create_user`, not on login. Since umut was created before the signal existed, run a one-time backfill: `python manage.py seed_defaults --user umut`.

Add `seed_defaults` management command: creates default categories + products for a given user (idempotent — skips existing names).
