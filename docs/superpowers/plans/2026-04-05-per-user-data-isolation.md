# Per-User Data Isolation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope all grocery data (categories, products, stock, sales) to the authenticated user so each user has a fully independent dataset.

**Architecture:** Add `owner = ForeignKey(User)` to `Category`, `Product`, `StockEntry`, `SaleRecord`. All API views and the dashboard filter by `request.user`. A `post_save` signal auto-seeds defaults (3 categories + 20 products) for new users. A `seed_defaults` management command backfills existing users created before the signal.

**Tech Stack:** Django 5.2, DRF, SQLite, Django signals

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/grocery/models.py` | Add `owner` FK; change `unique=True` → `unique_together` on name fields |
| Create | `backend/grocery/signals.py` | `_seed_defaults(user)` + `post_save` handler |
| Modify | `backend/grocery/apps.py` | Import signals in `ready()` |
| Create | `backend/grocery/migrations/0003_add_owner.py` | Add owner columns + backfill + non-nullable |
| Modify | `backend/grocery/api.py` | Scope all views + dashboard to `request.user` |
| Create | `backend/grocery/management/commands/seed_defaults.py` | Idempotent default-data backfill per user |
| Modify | `backend/grocery/management/commands/seed.py` | Add `--user` flag; scope creates to user |

---

### Task 1: Update models — add owner FK and fix unique constraints

`Category.name` and `Product.name` currently have `unique=True` globally. After isolation, names only need to be unique per user. Change both to `unique_together`.

**Files:**
- Modify: `backend/grocery/models.py`

- [ ] **Step 1: Update `models.py`**

Replace the entire file contents:

```python
# src/backend/InvenTree/grocery/models.py
"""Database models for the Grocery module."""

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Sum
from django.utils.translation import gettext_lazy as _


class Category(models.Model):
    """A category grouping grocery products (e.g. Vegetables, Fruits)."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='categories',
        verbose_name=_('Owner'),
    )
    name = models.CharField(max_length=100, verbose_name=_('Name'))
    order = models.PositiveIntegerField(default=0, verbose_name=_('Display Order'))

    class Meta:
        ordering = ['order', 'name']
        unique_together = [('owner', 'name')]
        verbose_name = _('Category')
        verbose_name_plural = _('Categories')

    def __str__(self):
        return self.name


class Product(models.Model):
    """A grocery product (e.g. Tomato, Banana)."""

    UNIT_KG = 'kg'
    UNIT_PIECE = 'piece'
    UNIT_CHOICES = [(UNIT_KG, _('kg')), (UNIT_PIECE, _('piece'))]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='products',
        verbose_name=_('Owner'),
    )
    name = models.CharField(max_length=200, verbose_name=_('Name'))
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products',
        verbose_name=_('Category'),
    )
    unit = models.CharField(
        max_length=10,
        choices=UNIT_CHOICES,
        default=UNIT_KG,
        verbose_name=_('Unit'),
    )
    sell_price = models.DecimalField(
        max_digits=10, decimal_places=2, verbose_name=_('Sell Price')
    )
    svg_icon = models.FileField(
        upload_to='grocery/icons/',
        blank=True,
        null=True,
        verbose_name=_('Icon'),
    )
    low_stock_threshold = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        verbose_name=_('Low Stock Threshold'),
    )
    expiry_note = models.CharField(
        max_length=200, blank=True, default='', verbose_name=_('Expiry Note')
    )
    is_active = models.BooleanField(default=True, verbose_name=_('Active'))

    class Meta:
        ordering = ['category__order', 'name']
        unique_together = [('owner', 'name')]
        verbose_name = _('Product')
        verbose_name_plural = _('Products')

    def __str__(self):
        return self.name

    @property
    def stock_level(self):
        """Current stock = total received - total sold."""
        received = (
            StockEntryItem.objects.filter(product=self).aggregate(
                total=Sum('quantity')
            )['total']
            or 0
        )
        sold = (
            SaleItem.objects.filter(product=self).aggregate(total=Sum('quantity'))[
                'total'
            ]
            or 0
        )
        return received - sold

    @property
    def most_recent_purchase_price(self):
        """Return the purchase price from the most recent stock entry for this product."""
        item = (
            StockEntryItem.objects.filter(product=self)
            .order_by('-entry__date', '-id')
            .first()
        )
        return item.purchase_price if item else None


class StockEntry(models.Model):
    """A restocking session (e.g. weekly delivery)."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='stock_entries',
        verbose_name=_('Owner'),
    )
    date = models.DateField(verbose_name=_('Date'))
    notes = models.TextField(blank=True, default='', verbose_name=_('Notes'))

    class Meta:
        ordering = ['-date']
        verbose_name = _('Stock Entry')
        verbose_name_plural = _('Stock Entries')

    def __str__(self):
        return f'Stock Entry {self.date}'


class StockEntryItem(models.Model):
    """One product line within a StockEntry."""

    entry = models.ForeignKey(
        StockEntry,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Entry'),
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='stock_items',
        verbose_name=_('Product'),
    )
    quantity = models.DecimalField(
        max_digits=10, decimal_places=3, verbose_name=_('Quantity'),
        validators=[MinValueValidator(0)],
    )
    purchase_price = models.DecimalField(
        max_digits=10, decimal_places=2, verbose_name=_('Purchase Price per Unit'),
        validators=[MinValueValidator(0)],
    )

    class Meta:
        verbose_name = _('Stock Entry Item')
        verbose_name_plural = _('Stock Entry Items')

    def __str__(self):
        return f'{self.product.name} x{self.quantity} @ {self.purchase_price}'


class SaleRecord(models.Model):
    """A sales session (typically one per day)."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sale_records',
        verbose_name=_('Owner'),
    )
    date = models.DateField(verbose_name=_('Date'))
    notes = models.TextField(blank=True, default='', verbose_name=_('Notes'))

    class Meta:
        ordering = ['-date']
        verbose_name = _('Sale Record')
        verbose_name_plural = _('Sale Records')

    def __str__(self):
        return f'Sale {self.date}'


class SaleItem(models.Model):
    """One product line within a SaleRecord."""

    sale = models.ForeignKey(
        SaleRecord,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Sale'),
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='sale_items',
        verbose_name=_('Product'),
    )
    quantity = models.DecimalField(
        max_digits=10, decimal_places=3, verbose_name=_('Quantity'),
        validators=[MinValueValidator(0)],
    )
    sell_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        verbose_name=_('Sell Price per Unit at Time of Sale'),
        validators=[MinValueValidator(0)],
    )

    class Meta:
        verbose_name = _('Sale Item')
        verbose_name_plural = _('Sale Items')

    def __str__(self):
        return f'{self.product.name} x{self.quantity} @ {self.sell_price}'
```

- [ ] **Step 2: Commit model changes**

```bash
git add backend/grocery/models.py
git commit -m "feat: add owner FK to Category, Product, StockEntry, SaleRecord"
```

---

### Task 2: Write the migration

The migration must: add nullable `owner` columns, backfill from first superuser, then make non-nullable. Also drops the old global unique constraints and adds `unique_together`.

**Files:**
- Create: `backend/grocery/migrations/0003_add_owner.py`

- [ ] **Step 1: Create the migration file**

```python
# backend/grocery/migrations/0003_add_owner.py
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def populate_owner(apps, schema_editor):
    """Assign all existing rows to the first superuser."""
    User = apps.get_model('auth', 'User')
    superuser = User.objects.filter(is_superuser=True).order_by('pk').first()
    if superuser is None:
        return  # empty DB, nothing to backfill
    for model_name in ('Category', 'Product', 'StockEntry', 'SaleRecord'):
        Model = apps.get_model('grocery', model_name)
        Model.objects.filter(owner__isnull=True).update(owner=superuser)


class Migration(migrations.Migration):

    dependencies = [
        ('grocery', '0002_alter_product_name_alter_product_svg_icon_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Add owner nullable to all four models
        migrations.AddField(
            model_name='category',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='products',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AddField(
            model_name='stockentry',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='stock_entries',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AddField(
            model_name='salerecord',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sale_records',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        # 2. Backfill existing rows
        migrations.RunPython(populate_owner, migrations.RunPython.noop),
        # 3. Make non-nullable
        migrations.AlterField(
            model_name='category',
            name='owner',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AlterField(
            model_name='product',
            name='owner',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='products',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AlterField(
            model_name='stockentry',
            name='owner',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='stock_entries',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AlterField(
            model_name='salerecord',
            name='owner',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sale_records',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        # 4. Drop old global unique on name, add unique_together with owner
        migrations.AlterUniqueTogether(
            name='category',
            unique_together={('owner', 'name')},
        ),
        migrations.AlterUniqueTogether(
            name='product',
            unique_together={('owner', 'name')},
        ),
    ]
```

- [ ] **Step 2: Run migration and verify**

```bash
cd backend
python manage.py migrate
```

Expected output:
```
Applying grocery.0003_add_owner... OK
```

- [ ] **Step 3: Verify existing data still present**

```bash
python manage.py shell -c "
from grocery.models import Category, Product, StockEntry, SaleRecord
print('Categories:', Category.objects.count())
print('Products:', Product.objects.count())
print('StockEntries:', StockEntry.objects.count())
print('SaleRecords:', SaleRecord.objects.count())
print('Category owners:', list(Category.objects.values_list('owner__username', flat=True).distinct()))
"
```

Expected: counts > 0, owner = `['ika']`

- [ ] **Step 4: Commit**

```bash
git add backend/grocery/migrations/0003_add_owner.py
git commit -m "feat: migration to add owner FK and backfill from first superuser"
```

---

### Task 3: Create signals.py — auto-seed defaults for new users

**Files:**
- Create: `backend/grocery/signals.py`

- [ ] **Step 1: Create `signals.py`**

```python
# backend/grocery/signals.py
"""Signals for the Grocery app."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from grocery.models import Category, Product

User = get_user_model()

DEFAULT_CATEGORIES = [
    {'name': 'Sebze', 'order': 1},
    {'name': 'Meyve', 'order': 2},
    {'name': 'Diğer', 'order': 3},
]

DEFAULT_PRODUCTS = [
    {'name': 'Domates',       'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '5'},
    {'name': 'Salatalık',     'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '3'},
    {'name': 'Kırmızı Biber', 'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '3'},
    {'name': 'Patlıcan',      'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Patates',       'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '10'},
    {'name': 'Soğan',         'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '5'},
    {'name': 'Havuç',         'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '3'},
    {'name': 'Ispanak',       'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Marul',         'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Elma',          'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '5'},
    {'name': 'Portakal',      'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '5'},
    {'name': 'Muz',           'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '3'},
    {'name': 'Limon',         'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Üzüm',          'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Kivi',          'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Ceviz',         'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '1'},
    {'name': 'Nohut',         'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Mercimek',      'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Ay Çekirdeği',  'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '1'},
    {'name': 'Kuru İncir',    'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '1'},
]


def seed_defaults(user):
    """Create default categories and products for a user. Idempotent — skips existing."""
    cat_map = {}
    for cat_data in DEFAULT_CATEGORIES:
        cat, _ = Category.objects.get_or_create(
            owner=user,
            name=cat_data['name'],
            defaults={'order': cat_data['order']},
        )
        cat_map[cat.name] = cat

    for p in DEFAULT_PRODUCTS:
        Product.objects.get_or_create(
            owner=user,
            name=p['name'],
            defaults={
                'category': cat_map.get(p['category']),
                'unit': p['unit'],
                'sell_price': Decimal('0'),
                'low_stock_threshold': Decimal(p['low_stock_threshold']),
            },
        )


@receiver(post_save, sender=User)
def on_user_created(sender, instance, created, **kwargs):
    """Auto-seed default categories and products when a new user is created."""
    if created:
        seed_defaults(instance)
```

- [ ] **Step 2: Commit**

```bash
git add backend/grocery/signals.py
git commit -m "feat: signals.py — auto-seed defaults for new users"
```

---

### Task 4: Register signal in apps.py

**Files:**
- Modify: `backend/grocery/apps.py`

- [ ] **Step 1: Update `apps.py`**

```python
# backend/grocery/apps.py
"""Django app config for the Grocery module."""

from django.apps import AppConfig


class GroceryConfig(AppConfig):
    """Grocery app config."""

    name = 'grocery'

    def ready(self):
        import grocery.signals  # noqa: F401 — registers signal handlers
```

- [ ] **Step 2: Commit**

```bash
git add backend/grocery/apps.py
git commit -m "feat: register post_save signal in GroceryConfig.ready()"
```

---

### Task 5: Scope all API views to request.user

Every view that returns or creates data must filter/set owner. The `DashboardView` also queries `SaleItem`, `Product`, and `StockEntry` directly and must be scoped.

**Files:**
- Modify: `backend/grocery/api.py`

- [ ] **Step 1: Replace `api.py`**

```python
# src/backend/InvenTree/grocery/api.py
"""REST API views for the Grocery module."""

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import DecimalField, ExpressionWrapper, F, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce
from django.urls import path
from django.utils.dateparse import parse_date

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from grocery.models import (
    Category,
    Product,
    SaleItem,
    SaleRecord,
    StockEntry,
    StockEntryItem,
)
from grocery.serializers import (
    CategorySerializer,
    ProductSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
)


class CategoryList(generics.ListCreateAPIView):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Category.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class CategoryDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Category.objects.filter(owner=self.request.user)


def _annotate_products(qs):
    """Annotate a Product queryset with stock_level and latest purchase price (bulk, no N+1)."""
    received_sq = Coalesce(
        Subquery(
            StockEntryItem.objects.filter(product_id=OuterRef('pk'))
            .values('product_id')
            .annotate(total=Sum('quantity'))
            .values('total')[:1],
            output_field=DecimalField(),
        ),
        Decimal('0'),
        output_field=DecimalField(),
    )
    sold_sq = Coalesce(
        Subquery(
            SaleItem.objects.filter(product_id=OuterRef('pk'))
            .values('product_id')
            .annotate(total=Sum('quantity'))
            .values('total')[:1],
            output_field=DecimalField(),
        ),
        Decimal('0'),
        output_field=DecimalField(),
    )
    latest_price_sq = Subquery(
        StockEntryItem.objects.filter(product_id=OuterRef('pk'))
        .order_by('-entry__date', '-id')
        .values('purchase_price')[:1],
        output_field=DecimalField(),
    )
    return qs.annotate(
        _stock_level=ExpressionWrapper(received_sq - sold_sq, output_field=DecimalField()),
        _most_recent_purchase_price=latest_price_sq,
    )


class ProductList(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        active_param = self.request.query_params.get('active', 'true')
        if active_param.lower() == 'false':
            qs = Product.objects.filter(owner=self.request.user)
        else:
            qs = Product.objects.filter(owner=self.request.user, is_active=True)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)
        return _annotate_products(qs)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ProductDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _annotate_products(Product.objects.filter(owner=self.request.user))


class StockEntryList(generics.ListCreateAPIView):
    serializer_class = StockEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return StockEntry.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class StockEntryDetail(generics.RetrieveAPIView):
    serializer_class = StockEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return StockEntry.objects.filter(owner=self.request.user)


class SaleRecordList(generics.ListCreateAPIView):
    serializer_class = SaleRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SaleRecord.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class SaleRecordDetail(generics.RetrieveAPIView):
    serializer_class = SaleRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SaleRecord.objects.filter(owner=self.request.user)


def _compute_stock_levels(user, active_only=True):
    """
    Compute stock level per product for a given user using bulk queries (not N×2).
    Returns a tuple: (received_map, sold_map) — dicts of {product_id: Decimal}.
    """
    product_filter = {'product__owner': user}
    if active_only:
        product_filter['product__is_active'] = True

    received_map = {
        r['product_id']: r['total']
        for r in StockEntryItem.objects.filter(**product_filter)
        .values('product_id')
        .annotate(total=Sum('quantity'))
    }
    sold_map = {
        s['product_id']: s['total']
        for s in SaleItem.objects.filter(**product_filter)
        .values('product_id')
        .annotate(total=Sum('quantity'))
    }
    return received_map, sold_map


class DashboardView(APIView):
    """Aggregated stats for the dashboard."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        range_param = request.query_params.get('range', 'today')
        date_param = request.query_params.get('date')
        today = parse_date(date_param) if date_param else date.today()

        if range_param == 'today':
            start, end = today, today
        elif range_param == 'week':
            start = today - timedelta(days=today.weekday())
            end = today
        else:  # month
            start = today.replace(day=1)
            end = today

        sale_items = SaleItem.objects.filter(
            sale__date__range=(start, end),
            sale__owner=user,
        )

        total_sales = sale_items.aggregate(
            total=Coalesce(
                Sum(ExpressionWrapper(F('quantity') * F('sell_price'), output_field=DecimalField())),
                Decimal('0'),
                output_field=DecimalField(),
            )
        )['total']

        latest_purchase_sq = (
            StockEntryItem.objects
            .filter(product_id=OuterRef('product_id'))
            .order_by('-entry__date', '-id')
            .values('purchase_price')[:1]
        )
        profit_qs = sale_items.annotate(
            latest_purchase_price=Coalesce(
                Subquery(latest_purchase_sq, output_field=DecimalField()),
                Decimal('0'),
                output_field=DecimalField(),
            )
        )
        profit = profit_qs.aggregate(
            total=Coalesce(
                Sum(
                    ExpressionWrapper(
                        F('quantity') * (F('sell_price') - F('latest_purchase_price')),
                        output_field=DecimalField(),
                    )
                ),
                Decimal('0'),
                output_field=DecimalField(),
            )
        )['total']

        items_sold_count = sale_items.count()

        products_sold = (
            sale_items
            .values('product__pk', 'product__name', 'product__unit')
            .annotate(
                revenue=Sum(ExpressionWrapper(F('quantity') * F('sell_price'), output_field=DecimalField())),
                total_qty=Sum('quantity'),
            )
            .order_by('-revenue')[:5]
        )
        best_sellers = [
            {
                'product_id': p['product__pk'],
                'name': p['product__name'],
                'unit': p['product__unit'],
                'revenue': p['revenue'],
                'quantity': p['total_qty'],
            }
            for p in products_sold
        ]

        received_map, sold_map = _compute_stock_levels(user, active_only=True)
        low_stock = []
        for p in Product.objects.filter(owner=user, is_active=True).values(
            'pk', 'name', 'unit', 'low_stock_threshold'
        ):
            level = received_map.get(p['pk'], Decimal('0')) - sold_map.get(p['pk'], Decimal('0'))
            if level <= p['low_stock_threshold']:
                low_stock.append({
                    'product_id': p['pk'],
                    'name': p['name'],
                    'stock_level': level,
                    'threshold': p['low_stock_threshold'],
                    'unit': p['unit'],
                })

        chart_start = today - timedelta(days=6)
        chart_qs = (
            SaleItem.objects.filter(
                sale__date__range=(chart_start, today),
                sale__owner=user,
            )
            .values('sale__date')
            .annotate(
                daily_sales=Sum(
                    ExpressionWrapper(F('quantity') * F('sell_price'), output_field=DecimalField())
                )
            )
        )
        daily_map = {row['sale__date']: row['daily_sales'] for row in chart_qs}
        chart = [
            {
                'date': str(today - timedelta(days=i)),
                'sales': daily_map.get(today - timedelta(days=i), Decimal('0')),
            }
            for i in range(6, -1, -1)
        ]

        return Response({
            'range': range_param,
            'start': str(start),
            'end': str(end),
            'total_sales': total_sales,
            'net_profit': profit,
            'items_sold': items_sold_count,
            'best_sellers': best_sellers,
            'low_stock': low_stock,
            'chart': chart,
        })


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
]
```

- [ ] **Step 2: Commit**

```bash
git add backend/grocery/api.py
git commit -m "feat: scope all API views and dashboard to request.user"
```

---

### Task 6: Create seed_defaults management command

Backfills default categories + products for a named user. Idempotent.

**Files:**
- Create: `backend/grocery/management/commands/seed_defaults.py`

- [ ] **Step 1: Create `seed_defaults.py`**

```python
# backend/grocery/management/commands/seed_defaults.py
"""
Management command: python manage.py seed_defaults --user <username>

Creates default categories and products for an existing user.
Idempotent — skips names that already exist for that user.
Use this to backfill users created before the auto-seed signal existed.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from grocery.signals import seed_defaults

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed default categories and products for a user'

    def add_arguments(self, parser):
        parser.add_argument('--user', required=True, help='Username to seed defaults for')

    def handle(self, *args, **options):
        username = options['user']
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f'User "{username}" does not exist')

        seed_defaults(user)
        self.stdout.write(self.style.SUCCESS(
            f'Default categories and products seeded for user "{username}".'
        ))
```

- [ ] **Step 2: Commit**

```bash
git add backend/grocery/management/commands/seed_defaults.py
git commit -m "feat: seed_defaults management command for backfilling existing users"
```

---

### Task 7: Update seed command to accept --user flag

The `seed` command now needs to scope categories, products, stock entries, and sales to a specific user.

**Files:**
- Modify: `backend/grocery/management/commands/seed.py`

- [ ] **Step 1: Replace `seed.py`**

```python
"""
Management command: python manage.py seed [--user <username>] [--clear]

Populates demo data for a user:
- Stock entry sessions over the past 2 weeks
- Daily sale records covering the past week

Categories and products are NOT created here — they are seeded by the
post_save signal (or seed_defaults command). This command only adds
stock and sales on top of whatever products exist for the user.

Usage:
    python manage.py seed                    # uses first superuser
    python manage.py seed --user umut
    python manage.py seed --user ika --clear # wipes ika's stock+sales first
"""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from grocery.models import Product, SaleItem, SaleRecord, StockEntry, StockEntryItem

User = get_user_model()

# Stock entries: (days_ago, [(product_name, qty, purchase_price), ...])
STOCK_ENTRIES = [
    (13, [
        ('Domates',       50, '10.00'),
        ('Salatalık',     30, '8.00'),
        ('Kırmızı Biber', 20, '13.00'),
        ('Patlıcan',      15, '9.00'),
        ('Patates',       80, '7.00'),
        ('Soğan',         60, '6.00'),
        ('Havuç',         25, '7.50'),
        ('Elma',          40, '14.00'),
        ('Portakal',      40, '12.00'),
        ('Muz',           25, '17.00'),
        ('Limon',         20, '10.00'),
        ('Ceviz',          5, '120.00'),
        ('Nohut',         15, '28.00'),
        ('Mercimek',      15, '24.00'),
    ]),
    (6, [
        ('Domates',       40, '11.00'),
        ('Salatalık',     25, '8.50'),
        ('Kırmızı Biber', 15, '14.00'),
        ('Ispanak',       10, '11.00'),
        ('Marul',         12, '9.00'),
        ('Elma',          30, '15.00'),
        ('Üzüm',          10, '22.00'),
        ('Kivi',           8, '26.00'),
        ('Ay Çekirdeği',   5, '35.00'),
        ('Kuru İncir',     3, '80.00'),
        ('Patates',       50, '7.50'),
        ('Soğan',         30, '6.50'),
    ]),
    (3, [
        ('Domates',       30, '11.50'),
        ('Salatalık',     20, '9.00'),
        ('Muz',           15, '18.00'),
        ('Portakal',      25, '13.00'),
        ('Limon',         10, '11.00'),
        ('Havuç',         20, '8.00'),
        ('Nohut',         10, '29.00'),
    ]),
    (0, [
        ('Domates',       20, '12.00'),
        ('Kırmızı Biber', 10, '15.00'),
        ('Elma',          20, '16.00'),
        ('Mercimek',       8, '25.00'),
    ]),
]

# Sales records: (days_ago, [(product_name, qty, sell_price), ...])
SALES = [
    (6, [
        ('Domates',       8.5,  '18.00'),
        ('Salatalık',     5.0,  '14.00'),
        ('Elma',          6.0,  '24.00'),
        ('Portakal',      5.0,  '20.00'),
        ('Patates',      10.0,  '12.00'),
        ('Soğan',         4.0,  '10.00'),
    ]),
    (5, [
        ('Domates',      12.0,  '18.00'),
        ('Salatalık',     7.5,  '14.00'),
        ('Kırmızı Biber', 3.0,  '22.00'),
        ('Muz',           4.0,  '28.00'),
        ('Elma',          5.0,  '24.00'),
        ('Nohut',         2.0,  '45.00'),
    ]),
    (4, [
        ('Domates',       9.0,  '18.00'),
        ('Patlıcan',      4.5,  '16.00'),
        ('Portakal',      6.0,  '20.00'),
        ('Limon',         2.5,  '18.00'),
        ('Patates',       8.0,  '12.00'),
        ('Havuç',         3.0,  '13.00'),
        ('Mercimek',      2.0,  '38.00'),
    ]),
    (3, [
        ('Domates',      15.0,  '18.00'),
        ('Salatalık',     8.0,  '14.00'),
        ('Kırmızı Biber', 4.0,  '22.00'),
        ('Ispanak',       3.0,  '20.00'),
        ('Marul',         2.5,  '15.00'),
        ('Elma',          7.0,  '24.00'),
        ('Üzüm',          2.0,  '35.00'),
        ('Ceviz',         0.5,  '180.00'),
    ]),
    (2, [
        ('Domates',      11.0,  '18.00'),
        ('Salatalık',     6.0,  '14.00'),
        ('Muz',           5.0,  '28.00'),
        ('Portakal',      4.0,  '20.00'),
        ('Kivi',          2.0,  '40.00'),
        ('Ay Çekirdeği',  1.5,  '55.00'),
        ('Kuru İncir',    0.5,  '120.00'),
        ('Soğan',         3.0,  '10.00'),
    ]),
    (1, [
        ('Domates',      13.0,  '18.00'),
        ('Salatalık',     9.0,  '14.00'),
        ('Kırmızı Biber', 3.5,  '22.00'),
        ('Patates',      12.0,  '12.00'),
        ('Elma',          8.0,  '24.00'),
        ('Nohut',         3.0,  '45.00'),
        ('Mercimek',      2.5,  '38.00'),
        ('Havuç',         4.0,  '13.00'),
    ]),
    (0, [
        ('Domates',       7.0,  '18.00'),
        ('Salatalık',     4.0,  '14.00'),
        ('Muz',           3.0,  '28.00'),
        ('Elma',          5.0,  '24.00'),
        ('Soğan',         2.0,  '10.00'),
        ('Limon',         1.5,  '18.00'),
    ]),
]


class Command(BaseCommand):
    help = 'Seed demo stock and sales data for a user'

    def add_arguments(self, parser):
        parser.add_argument('--user', default=None, help='Username to seed data for (default: first superuser)')
        parser.add_argument('--clear', action='store_true', help="Clear user's stock and sales before seeding")

    def handle(self, *args, **options):
        username = options['user']
        if username:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                raise CommandError(f'User "{username}" does not exist')
        else:
            user = User.objects.filter(is_superuser=True).order_by('pk').first()
            if not user:
                raise CommandError('No superuser found. Pass --user <username>.')

        if options['clear']:
            self.stdout.write(f'Clearing stock and sales for "{user.username}"...')
            SaleItem.objects.filter(sale__owner=user).delete()
            SaleRecord.objects.filter(owner=user).delete()
            StockEntryItem.objects.filter(entry__owner=user).delete()
            StockEntry.objects.filter(owner=user).delete()

        today = date.today()
        product_map = {p.name: p for p in Product.objects.filter(owner=user)}

        if not product_map:
            self.stdout.write(self.style.WARNING(
                f'No products found for "{user.username}". '
                'Run seed_defaults first: python manage.py seed_defaults --user ' + user.username
            ))
            return

        with transaction.atomic():
            self.stdout.write('Creating stock entries...')
            for days_ago, items in STOCK_ENTRIES:
                entry_date = today - timedelta(days=days_ago)
                entry = StockEntry.objects.create(owner=user, date=entry_date)
                for name, qty, price in items:
                    if name in product_map:
                        StockEntryItem.objects.create(
                            entry=entry,
                            product=product_map[name],
                            quantity=Decimal(str(qty)),
                            purchase_price=Decimal(price),
                        )

            self.stdout.write('Creating sales records...')
            for days_ago, items in SALES:
                sale_date = today - timedelta(days=days_ago)
                sale = SaleRecord.objects.create(owner=user, date=sale_date)
                for name, qty, price in items:
                    if name in product_map:
                        SaleItem.objects.create(
                            sale=sale,
                            product=product_map[name],
                            quantity=Decimal(str(qty)),
                            sell_price=Decimal(price),
                        )

        self.stdout.write(self.style.SUCCESS(
            f'Done! {len(STOCK_ENTRIES)} stock entries, {len(SALES)} sale records '
            f'created for "{user.username}".'
        ))
```

- [ ] **Step 2: Commit**

```bash
git add backend/grocery/management/commands/seed.py
git commit -m "feat: update seed command to scope data to --user"
```

---

### Task 8: Backfill umut + reseed ika's demo data

Run the management commands to fix the existing DB state.

- [ ] **Step 1: Seed defaults for umut**

```bash
docker compose exec backend python manage.py seed_defaults --user umut
```

Expected:
```
Default categories and products seeded for user "umut".
```

- [ ] **Step 2: Verify umut has isolated data**

```bash
docker compose exec backend python manage.py shell -c "
from grocery.models import Category, Product
from django.contrib.auth.models import User
ika = User.objects.get(username='ika')
umut = User.objects.get(username='umut')
print('ika categories:', Category.objects.filter(owner=ika).count())
print('umut categories:', Category.objects.filter(owner=umut).count())
print('ika products:', Product.objects.filter(owner=ika).count())
print('umut products:', Product.objects.filter(owner=umut).count())
"
```

Expected:
```
ika categories: 3
umut categories: 3
ika products: 20
umut products: 20
```

- [ ] **Step 3: Reseed ika's stock and sales demo data**

The old stock/sales already belong to ika (from migration backfill), but products now need sell_price updated. Run seed with --clear to get fresh demo data with prices:

```bash
docker compose exec backend python manage.py seed --user ika --clear
```

Expected:
```
Clearing stock and sales for "ika"...
Creating stock entries...
Creating sales records...
Done! 4 stock entries, 7 sale records created for "ika".
```

- [ ] **Step 4: Update ika's product prices** (ika's products currently have sell_price=0 from the signal — update them to the demo prices)

```bash
docker compose exec backend python manage.py shell -c "
from decimal import Decimal
from grocery.models import Product
from django.contrib.auth.models import User

ika = User.objects.get(username='ika')
prices = {
    'Domates': '18.00', 'Salatalık': '14.00', 'Kırmızı Biber': '22.00',
    'Patlıcan': '16.00', 'Patates': '12.00', 'Soğan': '10.00',
    'Havuç': '13.00', 'Ispanak': '20.00', 'Marul': '15.00',
    'Elma': '24.00', 'Portakal': '20.00', 'Muz': '28.00',
    'Limon': '18.00', 'Üzüm': '35.00', 'Kivi': '40.00',
    'Ceviz': '180.00', 'Nohut': '45.00', 'Mercimek': '38.00',
    'Ay Çekirdeği': '55.00', 'Kuru İncir': '120.00',
}
for name, price in prices.items():
    Product.objects.filter(owner=ika, name=name).update(sell_price=Decimal(price))
print('Prices updated for ika.')
"
```

- [ ] **Step 5: Verify isolation end-to-end**

```bash
docker compose exec backend python manage.py shell -c "
from grocery.models import SaleRecord, StockEntry
from django.contrib.auth.models import User
ika = User.objects.get(username='ika')
umut = User.objects.get(username='umut')
print('ika sales:', SaleRecord.objects.filter(owner=ika).count())
print('umut sales:', SaleRecord.objects.filter(owner=umut).count())
print('ika stock entries:', StockEntry.objects.filter(owner=ika).count())
print('umut stock entries:', StockEntry.objects.filter(owner=umut).count())
"
```

Expected:
```
ika sales: 7
umut sales: 0
ika stock entries: 4
umut stock entries: 0
```

---

### Task 9: Rebuild Docker and smoke test

- [ ] **Step 1: Rebuild backend**

```bash
docker compose up --build -d backend
```

- [ ] **Step 2: Run migrations in container**

```bash
sleep 5 && docker compose exec backend python manage.py migrate
```

- [ ] **Step 3: Smoke test as ika**

```bash
CSRF=$(curl -s -c /tmp/ck_ika.txt http://localhost:25565/api/auth/csrf/ | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -b /tmp/ck_ika.txt -c /tmp/ck_ika.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
  -d '{"username":"ika","password":"1"}' http://localhost:25565/api/auth/login/
echo ""
curl -s -b /tmp/ck_ika.txt http://localhost:25565/api/grocery/products/ | python3 -c "import sys,json; d=json.load(sys.stdin); print('ika products:', len(d))"
curl -s -b /tmp/ck_ika.txt "http://localhost:25565/api/grocery/dashboard/?range=today" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ika sales today: ₺' + str(d['total_sales']))"
```

Expected:
```
{"authenticated": true, "username": "ika"}
ika products: 20
ika sales today: ₺433.00
```

- [ ] **Step 4: Smoke test as umut**

```bash
CSRF=$(curl -s -c /tmp/ck_umut.txt http://localhost:25565/api/auth/csrf/ | python3 -c "import sys,json; print(json.load(sys.stdin)['csrfToken'])")
curl -s -b /tmp/ck_umut.txt -c /tmp/ck_umut.txt -H "X-CSRFToken: $CSRF" -H "Content-Type: application/json" \
  -d '{"username":"umut","password":"1"}' http://localhost:25565/api/auth/login/
echo ""
curl -s -b /tmp/ck_umut.txt http://localhost:25565/api/grocery/products/ | python3 -c "import sys,json; d=json.load(sys.stdin); print('umut products:', len(d))"
curl -s -b /tmp/ck_umut.txt "http://localhost:25565/api/grocery/dashboard/?range=today" | python3 -c "import sys,json; d=json.load(sys.stdin); print('umut sales today: ₺' + str(d['total_sales']))"
```

Expected:
```
{"authenticated": true, "username": "umut"}
umut products: 20
umut sales today: ₺0.00
```

- [ ] **Step 5: Final commit and push**

```bash
git push
```
