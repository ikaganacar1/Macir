# Debt & Expense Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user expense/income tracking and loan balance management to Macir, surfaced on a new `/finance` page and summarized on the main dashboard.

**Architecture:** Three new Django models (`FinanceEntry`, `Debt`, `DebtPayment`) with REST endpoints under `/api/grocery/`; lazy recurring-entry creation on GET; dashboard extended with three new finance aggregates. Frontend adds a `GroceryFinance` page (two-tab Mantine Tabs) and a summary card + button on `GroceryMain`.

**Tech Stack:** Django 5.2 + DRF, SQLite, React 19 + TypeScript, Mantine 8, TanStack Query 5

---

## File Map

**Backend — create/modify:**
- Modify: `backend/grocery/models.py` — add `FinanceEntry`, `Debt`, `DebtPayment`
- Create: `backend/grocery/migrations/0008_financeentry_debt_debtpayment.py` (auto-generated)
- Modify: `backend/grocery/serializers.py` — add three serializers
- Modify: `backend/grocery/api.py` — add views, `_create_missing_recurring`, dashboard extension, URL registration
- Modify: `backend/grocery/tests.py` — add `FinanceAPITest`, `DebtAPITest`, `DebtPaymentAPITest`, `DashboardFinanceTest`

**Frontend — create/modify:**
- Modify: `frontend/src/types.ts` — add `FinanceEntry`, `Debt`, `DebtPayment` interfaces; extend `DashboardData`
- Modify: `frontend/src/api.ts` — add `finance` and `debts` endpoints
- Modify: `frontend/src/App.tsx` — lazy-load `GroceryFinance`, add `/finance` route
- Modify: `frontend/src/pages/GroceryMain.tsx` — add finance summary cards + "Borçlar & Giderler" button
- Create: `frontend/src/pages/GroceryFinance.tsx` — new page
- Create: `frontend/src/pages/__tests__/GroceryFinance.test.tsx` — new tests
- Modify: `frontend/src/pages/__tests__/GroceryMain.test.tsx` — add finance card/button tests

---

## Task 1: Backend models

**Files:**
- Modify: `backend/grocery/models.py`

- [ ] **Step 1: Add three models to `backend/grocery/models.py`**

Append after the `StoreProfile` class (end of file):

```python
class FinanceEntry(models.Model):
    """A single expense or unexpected income record."""

    EXPENSE = 'expense'
    INCOME = 'income'
    ENTRY_TYPE_CHOICES = [(EXPENSE, 'Gider'), (INCOME, 'Gelir')]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='finance_entries',
    )
    category = models.CharField(max_length=100)
    entry_type = models.CharField(max_length=10, choices=ENTRY_TYPE_CHOICES, default=EXPENSE)
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    date = models.DateField()
    is_recurring = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-date', '-pk']
        verbose_name = 'Finans Kaydı'
        verbose_name_plural = 'Finans Kayıtları'

    def __str__(self):
        return f"{self.category} — {self.amount} ({self.date})"


class Debt(models.Model):
    """A loan or long-term liability with payment tracking."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='debts',
    )
    name = models.CharField(max_length=200)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    monthly_payment = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    start_date = models.DateField()
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-start_date', '-pk']
        verbose_name = 'Borç'
        verbose_name_plural = 'Borçlar'

    def __str__(self):
        return self.name


class DebtPayment(models.Model):
    """A single payment event against a Debt."""

    debt = models.ForeignKey(
        Debt,
        on_delete=models.CASCADE,
        related_name='payments',
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    date = models.DateField()
    notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-date', '-pk']
        verbose_name = 'Borç Ödemesi'
        verbose_name_plural = 'Borç Ödemeleri'

    def __str__(self):
        return f"{self.debt.name} — {self.amount} ({self.date})"
```

- [ ] **Step 2: Run migration**

```bash
cd /mnt/2tb_ssd/Macir/backend
python manage.py makemigrations grocery
python manage.py migrate
```

Expected output: `Migrations for 'grocery': ... 0008_debt_debtpayment_financeentry.py` and `OK`.

- [ ] **Step 3: Verify models are importable**

```bash
cd /mnt/2tb_ssd/Macir/backend
python manage.py shell -c "from grocery.models import FinanceEntry, Debt, DebtPayment; print('OK')"
```

Expected: `OK`

---

## Task 2: Backend serializers

**Files:**
- Modify: `backend/grocery/serializers.py`

- [ ] **Step 1: Add imports for new models at top of serializers.py**

Find the existing import block (around line 10):
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

Replace with:
```python
from grocery.models import (
    Category,
    Debt,
    DebtPayment,
    FinanceEntry,
    Product,
    SaleItem,
    SaleRecord,
    StockEntry,
    StockEntryItem,
    StoreProfile,
)
```

- [ ] **Step 2: Add three serializers at the end of `backend/grocery/serializers.py`**

Append after `StoreProfileSerializer`:

```python
class FinanceEntrySerializer(serializers.ModelSerializer):
    """Serializer for FinanceEntry."""

    class Meta:
        model = FinanceEntry
        fields = ['pk', 'category', 'entry_type', 'amount', 'date', 'is_recurring', 'notes']


class DebtSerializer(serializers.ModelSerializer):
    """Serializer for Debt with annotated remaining_amount."""

    remaining_amount = serializers.SerializerMethodField()

    def get_remaining_amount(self, obj):
        if hasattr(obj, 'remaining_amount') and obj.remaining_amount is not None:
            return obj.remaining_amount
        paid = obj.payments.aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')
        return obj.total_amount - paid

    class Meta:
        model = Debt
        fields = [
            'pk', 'name', 'total_amount', 'monthly_payment',
            'start_date', 'is_active', 'remaining_amount', 'notes',
        ]


class DebtPaymentSerializer(serializers.ModelSerializer):
    """Serializer for DebtPayment."""

    class Meta:
        model = DebtPayment
        fields = ['pk', 'amount', 'date', 'notes']
```

---

## Task 3: Backend API views + URL registration

**Files:**
- Modify: `backend/grocery/api.py`

- [ ] **Step 1: Add new imports at the top of `backend/grocery/api.py`**

Find the existing import block at the top. Add `datetime`, `ZoneInfo`, `get_object_or_404`, and new models/serializers:

After `from datetime import date, timedelta` add:
```python
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
```

Replace:
```python
from django.db.models import DecimalField, ExpressionWrapper, F, OuterRef, Subquery, Sum
```
With:
```python
from django.db.models import DecimalField, ExpressionWrapper, F, OuterRef, Subquery, Sum
from django.shortcuts import get_object_or_404
```

Replace the models import block:
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
With:
```python
from grocery.models import (
    Category,
    Debt,
    DebtPayment,
    FinanceEntry,
    Product,
    SaleItem,
    SaleRecord,
    StockEntry,
    StockEntryItem,
    StoreProfile,
)
```

Replace the serializers import block:
```python
from grocery.serializers import (
    CategorySerializer,
    ProductSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
    StoreProfileSerializer,
)
```
With:
```python
from grocery.serializers import (
    CategorySerializer,
    DebtPaymentSerializer,
    DebtSerializer,
    FinanceEntrySerializer,
    ProductSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
    StoreProfileSerializer,
)
```

Also add at top level (replace existing `from rest_framework.exceptions import ValidationError` if absent):
```python
from rest_framework.exceptions import ValidationError as DRFValidationError
```

- [ ] **Step 2: Add `_create_missing_recurring` helper function**

Add this function after the `_compute_stock_levels` function (before `DashboardView`):

```python
def _create_missing_recurring(user):
    """Lazily create current-month entries for all recurring FinanceEntry templates."""
    istanbul = ZoneInfo('Europe/Istanbul')
    today = datetime.now(istanbul).date()
    month_start = today.replace(day=1)

    # Build a map of most-recent template per (category, entry_type)
    templates = {}
    for entry in FinanceEntry.objects.filter(owner=user, is_recurring=True).order_by('-date'):
        key = (entry.category, entry.entry_type)
        if key not in templates:
            templates[key] = entry

    for (category, entry_type), template in templates.items():
        exists = FinanceEntry.objects.filter(
            owner=user,
            category=category,
            entry_type=entry_type,
            is_recurring=True,
            date__year=today.year,
            date__month=today.month,
        ).exists()
        if not exists:
            FinanceEntry.objects.create(
                owner=user,
                category=category,
                entry_type=entry_type,
                amount=template.amount,
                date=month_start,
                is_recurring=True,
                notes=template.notes,
            )
```

- [ ] **Step 3: Add FinanceEntry views**

Add after `ProfileView`:

```python
class FinanceEntryList(generics.ListCreateAPIView):
    serializer_class = FinanceEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        _create_missing_recurring(self.request.user)
        qs = FinanceEntry.objects.filter(owner=self.request.user)
        month = self.request.query_params.get('month')  # 'YYYY-MM'
        if month:
            try:
                year, mon = month.split('-')
                qs = qs.filter(date__year=int(year), date__month=int(mon))
            except (ValueError, AttributeError):
                pass
        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class FinanceEntryDetail(generics.DestroyAPIView):
    serializer_class = FinanceEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return FinanceEntry.objects.filter(owner=self.request.user)
```

- [ ] **Step 4: Add Debt + DebtPayment views**

Add after `FinanceEntryDetail`:

```python
def _annotate_debts(qs):
    """Annotate debt queryset with remaining_amount."""
    return qs.annotate(
        remaining_amount=ExpressionWrapper(
            F('total_amount') - Coalesce(
                Sum('payments__amount'),
                Decimal('0'),
                output_field=DecimalField(),
            ),
            output_field=DecimalField(),
        )
    )


class DebtList(generics.ListCreateAPIView):
    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Debt.objects.filter(owner=self.request.user)
        if self.request.query_params.get('include_inactive', 'false').lower() != 'true':
            qs = qs.filter(is_active=True)
        return _annotate_debts(qs)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class DebtDetail(generics.UpdateAPIView):
    serializer_class = DebtSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return _annotate_debts(Debt.objects.filter(owner=self.request.user))


class DebtPaymentList(generics.ListCreateAPIView):
    serializer_class = DebtPaymentSerializer
    permission_classes = [IsAuthenticated]

    def _get_debt(self):
        return get_object_or_404(Debt, pk=self.kwargs['debt_pk'], owner=self.request.user)

    def get_queryset(self):
        return DebtPayment.objects.filter(
            debt__owner=self.request.user,
            debt_id=self.kwargs['debt_pk'],
        )

    def perform_create(self, serializer):
        debt = self._get_debt()
        amount = serializer.validated_data['amount']
        total_paid = DebtPayment.objects.filter(debt=debt).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField())
        )['total']
        if total_paid + amount > debt.total_amount:
            raise DRFValidationError({'amount': 'Bu ödeme toplam borç miktarını aşıyor.'})
        serializer.save(debt=debt)


class DebtPaymentDetail(generics.DestroyAPIView):
    serializer_class = DebtPaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return DebtPayment.objects.filter(
            debt__owner=self.request.user,
            debt_id=self.kwargs['debt_pk'],
        )
```

- [ ] **Step 5: Register new URL patterns**

Find `grocery_api_urls` at the bottom of `api.py` and add the new paths:

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
    path('finance/', FinanceEntryList.as_view(), name='api-grocery-finance-list'),
    path('finance/<int:pk>/', FinanceEntryDetail.as_view(), name='api-grocery-finance-detail'),
    path('debts/', DebtList.as_view(), name='api-grocery-debt-list'),
    path('debts/<int:pk>/', DebtDetail.as_view(), name='api-grocery-debt-detail'),
    path('debts/<int:debt_pk>/payments/', DebtPaymentList.as_view(), name='api-grocery-debt-payment-list'),
    path('debts/<int:debt_pk>/payments/<int:pk>/', DebtPaymentDetail.as_view(), name='api-grocery-debt-payment-detail'),
]
```

---

## Task 4: Backend dashboard extension

**Files:**
- Modify: `backend/grocery/api.py` — `DashboardView.get()`

- [ ] **Step 1: Add finance aggregates to DashboardView.get()**

Find the `return Response({...})` block at the end of `DashboardView.get()` (around line 300). Replace it with:

```python
        istanbul = ZoneInfo('Europe/Istanbul')
        today_istanbul = datetime.now(istanbul).date()
        month_start_istanbul = today_istanbul.replace(day=1)

        monthly_expenses = FinanceEntry.objects.filter(
            owner=user,
            entry_type=FinanceEntry.EXPENSE,
            date__gte=month_start_istanbul,
            date__lte=today_istanbul,
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField())
        )['total']

        monthly_income_extra = FinanceEntry.objects.filter(
            owner=user,
            entry_type=FinanceEntry.INCOME,
            date__gte=month_start_istanbul,
            date__lte=today_istanbul,
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField())
        )['total']

        total_debt_principal = Debt.objects.filter(
            owner=user, is_active=True
        ).aggregate(
            total=Coalesce(Sum('total_amount'), Decimal('0'), output_field=DecimalField())
        )['total']

        total_debt_paid = DebtPayment.objects.filter(
            debt__owner=user, debt__is_active=True
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField())
        )['total']

        total_debt_remaining = total_debt_principal - total_debt_paid

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
            'monthly_expenses': monthly_expenses,
            'monthly_income_extra': monthly_income_extra,
            'total_debt_remaining': total_debt_remaining,
        })
```

---

## Task 5: Backend tests

**Files:**
- Modify: `backend/grocery/tests.py`

- [ ] **Step 1: Add import for new models at top of tests.py**

Find:
```python
from grocery.models import Category, Product, SaleItem, SaleRecord, StockEntry, StockEntryItem, StoreProfile
```
Replace with:
```python
from grocery.models import Category, Debt, DebtPayment, FinanceEntry, Product, SaleItem, SaleRecord, StockEntry, StockEntryItem, StoreProfile
```

- [ ] **Step 2: Add FinanceAPITest class at end of tests.py**

```python
class FinanceAPITest(APITestCase):
    """Tests for FinanceEntry CRUD and recurring logic."""

    def setUp(self):
        self.user = User.objects.create_user(username='finuser', password='pass')
        self.client.force_authenticate(user=self.user)
        # Clear auto-seeded data
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()

    def test_create_expense_entry(self):
        r = self.client.post('/api/grocery/finance/', {
            'category': 'Kira', 'entry_type': 'expense',
            'amount': '5000.00', 'date': '2026-04-01',
            'is_recurring': False, 'notes': '',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(FinanceEntry.objects.filter(owner=self.user).count(), 1)

    def test_create_income_entry(self):
        r = self.client.post('/api/grocery/finance/', {
            'category': 'Bonus', 'entry_type': 'income',
            'amount': '500.00', 'date': '2026-04-05',
            'is_recurring': False, 'notes': '',
        }, format='json')
        self.assertEqual(r.status_code, 201)

    def test_list_entries_filtered_by_month(self):
        FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='5000.00', date='2026-04-01', is_recurring=False,
        )
        FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='5000.00', date='2026-03-01', is_recurring=False,
        )
        r = self.client.get('/api/grocery/finance/?month=2026-04')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['date'], '2026-04-01')

    def test_delete_entry(self):
        entry = FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='5000.00', date='2026-04-01', is_recurring=False,
        )
        r = self.client.delete(f'/api/grocery/finance/{entry.pk}/')
        self.assertEqual(r.status_code, 204)
        self.assertEqual(FinanceEntry.objects.filter(owner=self.user).count(), 0)

    def test_ownership_isolation(self):
        other = User.objects.create_user(username='other_fin', password='p')
        FinanceEntry.objects.create(
            owner=other, category='Kira', entry_type='expense',
            amount='3000.00', date='2026-04-01', is_recurring=False,
        )
        r = self.client.get('/api/grocery/finance/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 0)

    def test_recurring_entry_auto_created_for_current_month(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        # Create a recurring entry for a past month
        past_month = '2026-03-01'
        FinanceEntry.objects.create(
            owner=self.user, category='Elektrik', entry_type='expense',
            amount='400.00', date=past_month, is_recurring=True,
        )
        istanbul = ZoneInfo('Europe/Istanbul')
        today = datetime.now(istanbul).date()
        # Calling GET triggers lazy creation
        r = self.client.get('/api/grocery/finance/')
        self.assertEqual(r.status_code, 200)
        # Should now have an entry for current month too
        current = FinanceEntry.objects.filter(
            owner=self.user, category='Elektrik', is_recurring=True,
            date__year=today.year, date__month=today.month,
        )
        self.assertTrue(current.exists())

    def test_recurring_not_duplicated_on_multiple_gets(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        istanbul = ZoneInfo('Europe/Istanbul')
        today = datetime.now(istanbul).date()
        FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='5000.00', date='2026-03-01', is_recurring=True,
        )
        self.client.get('/api/grocery/finance/')
        self.client.get('/api/grocery/finance/')
        count = FinanceEntry.objects.filter(
            owner=self.user, category='Kira', is_recurring=True,
            date__year=today.year, date__month=today.month,
        ).count()
        self.assertEqual(count, 1)
```

- [ ] **Step 3: Add DebtAPITest class**

```python
class DebtAPITest(APITestCase):
    """Tests for Debt CRUD and remaining_amount annotation."""

    def setUp(self):
        self.user = User.objects.create_user(username='debtuser', password='pass')
        self.client.force_authenticate(user=self.user)
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()

    def test_create_debt(self):
        r = self.client.post('/api/grocery/debts/', {
            'name': 'Banka Kredisi', 'total_amount': '50000.00',
            'monthly_payment': '2000.00', 'start_date': '2026-01-01', 'notes': '',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Debt.objects.filter(owner=self.user).count(), 1)

    def test_remaining_amount_equals_total_with_no_payments(self):
        debt = Debt.objects.create(
            owner=self.user, name='Test', total_amount='10000.00',
            monthly_payment='500.00', start_date='2026-01-01',
        )
        r = self.client.get('/api/grocery/debts/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(float(r.data[0]['remaining_amount']), 10000.00)

    def test_remaining_amount_decreases_with_payments(self):
        debt = Debt.objects.create(
            owner=self.user, name='Test', total_amount='10000.00',
            monthly_payment='500.00', start_date='2026-01-01',
        )
        DebtPayment.objects.create(debt=debt, amount='2000.00', date='2026-02-01')
        r = self.client.get('/api/grocery/debts/')
        self.assertEqual(float(r.data[0]['remaining_amount']), 8000.00)

    def test_inactive_debts_excluded_by_default(self):
        Debt.objects.create(
            owner=self.user, name='Paid', total_amount='5000.00',
            monthly_payment='500.00', start_date='2026-01-01', is_active=False,
        )
        r = self.client.get('/api/grocery/debts/')
        self.assertEqual(len(r.data), 0)

    def test_inactive_debts_included_with_param(self):
        Debt.objects.create(
            owner=self.user, name='Paid', total_amount='5000.00',
            monthly_payment='500.00', start_date='2026-01-01', is_active=False,
        )
        r = self.client.get('/api/grocery/debts/?include_inactive=true')
        self.assertEqual(len(r.data), 1)

    def test_ownership_isolation(self):
        other = User.objects.create_user(username='other_debt', password='p')
        Debt.objects.create(
            owner=other, name='Other debt', total_amount='1000.00',
            monthly_payment='100.00', start_date='2026-01-01',
        )
        r = self.client.get('/api/grocery/debts/')
        self.assertEqual(len(r.data), 0)

    def test_patch_is_active_false(self):
        debt = Debt.objects.create(
            owner=self.user, name='Test', total_amount='5000.00',
            monthly_payment='500.00', start_date='2026-01-01',
        )
        r = self.client.patch(f'/api/grocery/debts/{debt.pk}/', {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 200)
        debt.refresh_from_db()
        self.assertFalse(debt.is_active)
```

- [ ] **Step 4: Add DebtPaymentAPITest class**

```python
class DebtPaymentAPITest(APITestCase):
    """Tests for DebtPayment creation, listing, and overpayment guard."""

    def setUp(self):
        self.user = User.objects.create_user(username='payuser', password='pass')
        self.client.force_authenticate(user=self.user)
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.debt = Debt.objects.create(
            owner=self.user, name='Kredisi', total_amount='10000.00',
            monthly_payment='1000.00', start_date='2026-01-01',
        )

    def test_create_payment(self):
        r = self.client.post(
            f'/api/grocery/debts/{self.debt.pk}/payments/',
            {'amount': '1000.00', 'date': '2026-04-01', 'notes': ''},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(DebtPayment.objects.filter(debt=self.debt).count(), 1)

    def test_list_payments(self):
        DebtPayment.objects.create(debt=self.debt, amount='1000.00', date='2026-02-01')
        DebtPayment.objects.create(debt=self.debt, amount='1000.00', date='2026-03-01')
        r = self.client.get(f'/api/grocery/debts/{self.debt.pk}/payments/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)

    def test_overpayment_rejected(self):
        DebtPayment.objects.create(debt=self.debt, amount='9500.00', date='2026-02-01')
        r = self.client.post(
            f'/api/grocery/debts/{self.debt.pk}/payments/',
            {'amount': '1000.00', 'date': '2026-04-01', 'notes': ''},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('amount', r.data)

    def test_other_user_cannot_access_payments(self):
        other = User.objects.create_user(username='other_pay', password='p')
        self.client.force_authenticate(user=other)
        r = self.client.get(f'/api/grocery/debts/{self.debt.pk}/payments/')
        self.assertEqual(r.status_code, 404)
```

- [ ] **Step 5: Add DashboardFinanceTest class**

```python
class DashboardFinanceTest(APITestCase):
    """Tests for monthly_expenses, monthly_income_extra, total_debt_remaining in dashboard."""

    def setUp(self):
        self.user = User.objects.create_user(username='dashfin', password='pass')
        self.client.force_authenticate(user=self.user)
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()

    def test_dashboard_includes_finance_fields_when_empty(self):
        r = self.client.get('/api/grocery/dashboard/?range=today')
        self.assertEqual(r.status_code, 200)
        self.assertIn('monthly_expenses', r.data)
        self.assertIn('monthly_income_extra', r.data)
        self.assertIn('total_debt_remaining', r.data)
        self.assertEqual(float(r.data['monthly_expenses']), 0.0)
        self.assertEqual(float(r.data['total_debt_remaining']), 0.0)

    def test_dashboard_monthly_expenses_sums_current_month(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        istanbul = ZoneInfo('Europe/Istanbul')
        today = datetime.now(istanbul).date()
        FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='3000.00', date=today, is_recurring=False,
        )
        FinanceEntry.objects.create(
            owner=self.user, category='Elektrik', entry_type='expense',
            amount='500.00', date=today, is_recurring=False,
        )
        r = self.client.get('/api/grocery/dashboard/?range=today')
        self.assertEqual(float(r.data['monthly_expenses']), 3500.0)

    def test_dashboard_total_debt_remaining_correct(self):
        debt = Debt.objects.create(
            owner=self.user, name='Kredi', total_amount='20000.00',
            monthly_payment='1000.00', start_date='2026-01-01',
        )
        DebtPayment.objects.create(debt=debt, amount='5000.00', date='2026-02-01')
        r = self.client.get('/api/grocery/dashboard/?range=today')
        self.assertEqual(float(r.data['total_debt_remaining']), 15000.0)
```

- [ ] **Step 6: Run all backend tests**

```bash
cd /mnt/2tb_ssd/Macir/backend
python manage.py test grocery
```

Expected: all tests pass, including the new ones.

- [ ] **Step 7: Commit backend**

```bash
cd /mnt/2tb_ssd/Macir
git add backend/grocery/models.py backend/grocery/migrations/ \
        backend/grocery/serializers.py backend/grocery/api.py \
        backend/grocery/tests.py
git commit -m "feat: add FinanceEntry, Debt, DebtPayment models, API, and dashboard extension"
```

---

## Task 6: Frontend types + endpoints

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/api.ts`

- [ ] **Step 1: Add new interfaces and extend DashboardData in `frontend/src/types.ts`**

Append to end of file:

```ts
export interface FinanceEntry {
  pk: number;
  category: string;
  entry_type: 'expense' | 'income';
  amount: string;
  date: string;
  is_recurring: boolean;
  notes: string;
}

export interface Debt {
  pk: number;
  name: string;
  total_amount: string;
  monthly_payment: string;
  start_date: string;
  is_active: boolean;
  remaining_amount: string;
  notes: string;
}

export interface DebtPayment {
  pk: number;
  debt: number;
  amount: string;
  date: string;
  notes: string;
}
```

Also extend `DashboardData` — find:
```ts
  chart: { date: string; sales: string | number }[];
}
```
Replace with:
```ts
  chart: { date: string; sales: string | number }[];
  monthly_expenses?: string | number;
  monthly_income_extra?: string | number;
  total_debt_remaining?: string | number;
}
```

- [ ] **Step 2: Add endpoints in `frontend/src/api.ts`**

Find:
```ts
  profile:      '/api/grocery/profile/',
};
```
Replace with:
```ts
  profile:      '/api/grocery/profile/',
  finance:      '/api/grocery/finance/',
  debts:        '/api/grocery/debts/',
};
```

---

## Task 7: App.tsx route + GroceryMain changes

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/GroceryMain.tsx`

- [ ] **Step 1: Add lazy import and route in `frontend/src/App.tsx`**

Find:
```ts
const GroceryProfile = lazy(() => import('./pages/GroceryProfile'));
```
Add after it:
```ts
const GroceryFinance = lazy(() => import('./pages/GroceryFinance'));
```

Find:
```tsx
              <Route path='/profile' element={<GroceryProfile />} />
```
Add after it:
```tsx
              <Route path='/finance' element={<GroceryFinance />} />
```

- [ ] **Step 2: Add IconWallet import to GroceryMain.tsx**

Find in `frontend/src/pages/GroceryMain.tsx`:
```ts
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
Replace with:
```ts
import {
  IconAlertTriangle,
  IconChartBar,
  IconClipboardList,
  IconPackage,
  IconSettings,
  IconShoppingBag,
  IconShoppingCart,
  IconWallet,
} from '@tabler/icons-react';
```

- [ ] **Step 3: Add finance summary cards to GroceryMain.tsx**

Find the closing `</SimpleGrid>` after the `stat-profit` card (around line 106):
```tsx
        </Paper>
        </SimpleGrid>
```
Add after the closing `</SimpleGrid>`:
```tsx

      {/* Finance summary */}
      <SimpleGrid cols={2} spacing='sm'>
        <Paper
          withBorder
          p='md'
          style={{ border: '1px solid #e8f5e9', cursor: 'pointer' }}
          onClick={() => navigate('/finance')}
          data-testid='stat-monthly-expenses'
        >
          <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Aylık Gider</Text>
          <Text size='xl' fw={700} c='red'>
            ₺{stats ? parseFloat(String(stats.monthly_expenses ?? 0)).toFixed(2) : '0.00'}
          </Text>
        </Paper>
        <Paper
          withBorder
          p='md'
          style={{ border: '1px solid #e8f5e9', cursor: 'pointer' }}
          onClick={() => navigate('/finance')}
          data-testid='stat-debt-remaining'
        >
          <Text size='xs' c='dimmed' tt='uppercase' fw={600}>Kalan Borç</Text>
          <Text size='xl' fw={700} c='orange'>
            ₺{stats ? parseFloat(String(stats.total_debt_remaining ?? 0)).toFixed(2) : '0.00'}
          </Text>
        </Paper>
      </SimpleGrid>
```

- [ ] **Step 4: Add "Borçlar & Giderler" button to GroceryMain.tsx**

Find:
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
Add after it:
```tsx

      <Button
        variant='default'
        h={56}
        fullWidth
        leftSection={<IconWallet size={20} />}
        onClick={() => navigate('/finance')}
        data-testid='btn-finance'
      >
        Borçlar & Giderler
      </Button>
```

---

## Task 8: GroceryFinance page

**Files:**
- Create: `frontend/src/pages/GroceryFinance.tsx`

- [ ] **Step 1: Create `frontend/src/pages/GroceryFinance.tsx`**

```tsx
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Progress,
  SegmentedControl,
  Skeleton,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, endpoints } from '../api';
import { NumpadInput } from '../components/NumpadInput';
import type { Debt, DebtPayment, FinanceEntry } from '../types';

function getIstanbulToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}

function getMonthParam(offset: number): string {
  const todayStr = getIstanbulToday();
  const [year, month] = todayStr.split('-').map(Number);
  const d = new Date(year, month - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(param: string): string {
  const [year, month] = param.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

const ENTRY_TYPE_COLOR: Record<string, string> = { expense: 'red', income: 'green' };
const ENTRY_TYPE_LABEL: Record<string, string> = { expense: 'Gider', income: 'Gelir' };

export default function GroceryFinance() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Entries tab
  const [monthOffset, setMonthOffset] = useState(0);
  const monthParam = getMonthParam(monthOffset);
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [entryCategory, setEntryCategory] = useState('');
  const [entryType, setEntryType] = useState<'expense' | 'income'>('expense');
  const [entryAmount, setEntryAmount] = useState('0');
  const [entryRecurring, setEntryRecurring] = useState(false);
  const [entryDate, setEntryDate] = useState(getIstanbulToday());
  const [entryNotes, setEntryNotes] = useState('');

  // Debts tab
  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [debtName, setDebtName] = useState('');
  const [debtTotal, setDebtTotal] = useState('0');
  const [debtMonthly, setDebtMonthly] = useState('0');
  const [debtStartDate, setDebtStartDate] = useState(getIstanbulToday());
  const [debtNotes, setDebtNotes] = useState('');
  const [expandedDebt, setExpandedDebt] = useState<number | null>(null);
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [paymentDebtPk, setPaymentDebtPk] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('0');
  const [paymentDate, setPaymentDate] = useState(getIstanbulToday());
  const [paymentNotes, setPaymentNotes] = useState('');

  const { data: entries = [], isLoading: entriesLoading } = useQuery<FinanceEntry[]>({
    queryKey: ['finance-entries', monthParam],
    queryFn: () =>
      api.get(endpoints.finance, { params: { month: monthParam } }).then((r) => r.data),
  });

  const { data: debts = [], isLoading: debtsLoading } = useQuery<Debt[]>({
    queryKey: ['debts'],
    queryFn: () => api.get(endpoints.debts).then((r) => r.data),
  });

  const { data: payments = [] } = useQuery<DebtPayment[]>({
    queryKey: ['debt-payments', expandedDebt],
    queryFn: () =>
      api.get(`${endpoints.debts}${expandedDebt}/payments/`).then((r) => r.data),
    enabled: expandedDebt !== null,
  });

  const { mutate: addEntry, isPending: addingEntry } = useMutation({
    mutationFn: () =>
      api.post(endpoints.finance, {
        category: entryCategory,
        entry_type: entryType,
        amount: entryAmount,
        date: entryDate,
        is_recurring: entryRecurring,
        notes: entryNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-entries'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      setAddEntryOpen(false);
      setEntryCategory('');
      setEntryAmount('0');
      setEntryRecurring(false);
      setEntryNotes('');
      notifications.show({ message: 'Kayıt eklendi', color: 'green' });
    },
    onError: () => notifications.show({ message: 'Hata oluştu', color: 'red' }),
  });

  const { mutate: deleteEntry } = useMutation({
    mutationFn: (pk: number) => api.delete(`${endpoints.finance}${pk}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['finance-entries'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
    },
    onError: () => notifications.show({ message: 'Silinemedi', color: 'red' }),
  });

  const { mutate: addDebt, isPending: addingDebt } = useMutation({
    mutationFn: () =>
      api.post(endpoints.debts, {
        name: debtName,
        total_amount: debtTotal,
        monthly_payment: debtMonthly,
        start_date: debtStartDate,
        notes: debtNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      setAddDebtOpen(false);
      setDebtName('');
      setDebtTotal('0');
      setDebtMonthly('0');
      setDebtNotes('');
      notifications.show({ message: 'Borç eklendi', color: 'green' });
    },
    onError: () => notifications.show({ message: 'Hata oluştu', color: 'red' }),
  });

  const { mutate: addPayment, isPending: addingPayment } = useMutation({
    mutationFn: () =>
      api.post(`${endpoints.debts}${paymentDebtPk}/payments/`, {
        amount: paymentAmount,
        date: paymentDate,
        notes: paymentNotes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-payments', paymentDebtPk] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      setAddPaymentOpen(false);
      setPaymentAmount('0');
      setPaymentNotes('');
      notifications.show({ message: 'Ödeme eklendi', color: 'green' });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.amount?.[0] ?? 'Hata oluştu';
      notifications.show({ message: msg, color: 'red' });
    },
  });

  const { mutate: closeDebt } = useMutation({
    mutationFn: (pk: number) => api.patch(`${endpoints.debts}${pk}/`, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['grocery-dashboard-today'] });
      notifications.show({ message: 'Borç kapatıldı', color: 'gray' });
    },
  });

  return (
    <Stack gap={0} style={{ minHeight: '100vh', background: '#f9faf7' }}>
      {/* Sticky header */}
      <Box
        p='md'
        style={{
          position: 'sticky',
          top: 0,
          background: '#f9faf7',
          zIndex: 10,
          borderBottom: '1px solid #e8f5e9',
        }}
      >
        <Group>
          <Button
            variant='subtle'
            color='gray'
            px='xs'
            onClick={() => navigate('/')}
            leftSection={<IconArrowLeft size={18} />}
            data-testid='btn-back'
          >
            {''}
          </Button>
          <Title order={4}>Borçlar & Giderler</Title>
        </Group>
      </Box>

      <Tabs defaultValue='entries' style={{ flex: 1 }}>
        <Tabs.List px='md' pt='sm'>
          <Tabs.Tab value='entries' data-testid='tab-entries'>
            Giderler / Gelirler
          </Tabs.Tab>
          <Tabs.Tab value='debts' data-testid='tab-debts'>
            Borçlar
          </Tabs.Tab>
        </Tabs.List>

        {/* ENTRIES TAB */}
        <Tabs.Panel value='entries' pt='md'>
          <Stack px='md' gap='sm'>
            {/* Month navigator */}
            <Group justify='space-between' align='center'>
              <ActionIcon
                variant='subtle'
                color='gray'
                onClick={() => setMonthOffset((o) => o - 1)}
                data-testid='btn-prev-month'
              >
                <IconChevronUp size={16} style={{ transform: 'rotate(-90deg)' }} />
              </ActionIcon>
              <Text fw={600} size='sm' data-testid='month-label'>
                {getMonthLabel(monthParam)}
              </Text>
              <ActionIcon
                variant='subtle'
                color='gray'
                onClick={() => setMonthOffset((o) => o + 1)}
                disabled={monthOffset >= 0}
                data-testid='btn-next-month'
              >
                <IconChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
              </ActionIcon>
            </Group>

            <Button
              variant='light'
              color='green'
              leftSection={<IconPlus size={16} />}
              data-testid='btn-add-entry'
              onClick={() => {
                setEntryDate(getIstanbulToday());
                setAddEntryOpen(true);
              }}
            >
              Ekle
            </Button>

            {entriesLoading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} h={48} radius='md' />)
            ) : entries.length === 0 ? (
              <Text c='dimmed' ta='center' py='xl'>
                Bu ay kayıt yok
              </Text>
            ) : (
              entries.map((entry) => (
                <Paper
                  key={entry.pk}
                  withBorder
                  p='sm'
                  style={{ border: '1px solid #e8f5e9' }}
                  data-testid={`entry-row-${entry.pk}`}
                >
                  <Group justify='space-between'>
                    <Stack gap={2}>
                      <Group gap='xs'>
                        <Text size='sm' fw={600}>
                          {entry.category}
                        </Text>
                        <Badge
                          size='xs'
                          color={ENTRY_TYPE_COLOR[entry.entry_type]}
                          variant='light'
                        >
                          {ENTRY_TYPE_LABEL[entry.entry_type]}
                        </Badge>
                        {entry.is_recurring && (
                          <Badge size='xs' color='blue' variant='outline'>
                            Aylık
                          </Badge>
                        )}
                      </Group>
                      <Text size='xs' c='dimmed'>
                        {entry.date}
                      </Text>
                    </Stack>
                    <Group gap='xs'>
                      <Text
                        size='sm'
                        fw={700}
                        c={entry.entry_type === 'expense' ? 'red' : 'green'}
                      >
                        ₺{parseFloat(entry.amount).toFixed(2)}
                      </Text>
                      <ActionIcon
                        variant='subtle'
                        color='red'
                        size='sm'
                        data-testid={`btn-delete-entry-${entry.pk}`}
                        onClick={() => deleteEntry(entry.pk)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Paper>
              ))
            )}
          </Stack>
        </Tabs.Panel>

        {/* DEBTS TAB */}
        <Tabs.Panel value='debts' pt='md'>
          <Stack px='md' gap='sm'>
            <Button
              variant='light'
              color='green'
              leftSection={<IconPlus size={16} />}
              data-testid='btn-add-debt'
              onClick={() => {
                setDebtStartDate(getIstanbulToday());
                setAddDebtOpen(true);
              }}
            >
              Borç Ekle
            </Button>

            {debtsLoading ? (
              [1, 2].map((i) => <Skeleton key={i} h={80} radius='md' />)
            ) : debts.length === 0 ? (
              <Text c='dimmed' ta='center' py='xl'>
                Aktif borç yok
              </Text>
            ) : (
              debts.map((debt) => {
                const total = parseFloat(debt.total_amount);
                const remaining = parseFloat(debt.remaining_amount);
                const paid = total - remaining;
                const paidPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                const isExpanded = expandedDebt === debt.pk;

                return (
                  <Paper
                    key={debt.pk}
                    withBorder
                    style={{ border: '1px solid #e8f5e9', overflow: 'hidden' }}
                    data-testid={`debt-card-${debt.pk}`}
                  >
                    <Stack p='sm' gap='xs'>
                      <Group
                        justify='space-between'
                        style={{ cursor: 'pointer' }}
                        onClick={() =>
                          setExpandedDebt(isExpanded ? null : debt.pk)
                        }
                      >
                        <Stack gap={2}>
                          <Text size='sm' fw={600}>
                            {debt.name}
                          </Text>
                          <Text size='xs' c='dimmed'>
                            ₺{remaining.toFixed(2)} / ₺{total.toFixed(2)} kaldı
                          </Text>
                        </Stack>
                        <Group gap='xs'>
                          <Text size='xs' c='dimmed'>
                            ₺{parseFloat(debt.monthly_payment).toFixed(2)}/ay
                          </Text>
                          {isExpanded ? (
                            <IconChevronUp size={16} color='gray' />
                          ) : (
                            <IconChevronDown size={16} color='gray' />
                          )}
                        </Group>
                      </Group>
                      <Progress
                        value={paidPct}
                        color='green'
                        size='sm'
                        data-testid={`debt-progress-${debt.pk}`}
                      />
                    </Stack>

                    {isExpanded && (
                      <Box
                        px='sm'
                        pb='sm'
                        style={{ borderTop: '1px solid #e8f5e9' }}
                        data-testid={`debt-payments-${debt.pk}`}
                      >
                        <Group justify='space-between' py='xs'>
                          <Text size='xs' c='dimmed' fw={600}>
                            ÖDEMELER
                          </Text>
                          <Group gap='xs'>
                            <Button
                              size='xs'
                              variant='light'
                              color='green'
                              data-testid={`btn-add-payment-${debt.pk}`}
                              onClick={() => {
                                setPaymentDebtPk(debt.pk);
                                setPaymentAmount(debt.monthly_payment);
                                setPaymentDate(getIstanbulToday());
                                setAddPaymentOpen(true);
                              }}
                            >
                              Ödeme Ekle
                            </Button>
                            <Button
                              size='xs'
                              variant='subtle'
                              color='gray'
                              onClick={() => closeDebt(debt.pk)}
                            >
                              Kapat
                            </Button>
                          </Group>
                        </Group>
                        {payments.length === 0 ? (
                          <Text size='xs' c='dimmed'>
                            Henüz ödeme yok
                          </Text>
                        ) : (
                          payments.map((p) => (
                            <Group key={p.pk} justify='space-between' py={4}>
                              <Text size='xs' c='dimmed'>
                                {p.date}
                              </Text>
                              <Text size='xs' fw={600} c='green'>
                                ₺{parseFloat(p.amount).toFixed(2)}
                              </Text>
                            </Group>
                          ))
                        )}
                      </Box>
                    )}
                  </Paper>
                );
              })
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* Add Entry Modal */}
      <Modal
        opened={addEntryOpen}
        onClose={() => setAddEntryOpen(false)}
        title='Kayıt Ekle'
        centered
      >
        <Stack gap='sm'>
          <TextInput
            label='Kategori'
            placeholder='Kira, Elektrik, İşçi Maaşı...'
            value={entryCategory}
            onChange={(e) => setEntryCategory(e.currentTarget.value)}
            data-testid='input-entry-category'
          />
          <SegmentedControl
            value={entryType}
            onChange={(v) => setEntryType(v as 'expense' | 'income')}
            data={[
              { label: 'Gider', value: 'expense' },
              { label: 'Gelir', value: 'income' },
            ]}
            fullWidth
            data-testid='entry-type-control'
          />
          <NumpadInput value={entryAmount} onChange={setEntryAmount} />
          <Switch
            label='Her ay tekrarla'
            checked={entryRecurring}
            onChange={(e) => setEntryRecurring(e.currentTarget.checked)}
            data-testid='switch-recurring'
          />
          <TextInput
            label='Tarih'
            value={entryDate}
            onChange={(e) => setEntryDate(e.currentTarget.value)}
          />
          <TextInput
            label='Not (isteğe bağlı)'
            value={entryNotes}
            onChange={(e) => setEntryNotes(e.currentTarget.value)}
          />
          <Button
            color='green'
            loading={addingEntry}
            disabled={!entryCategory.trim() || entryAmount === '0'}
            onClick={() => addEntry()}
            data-testid='btn-save-entry'
          >
            Kaydet
          </Button>
        </Stack>
      </Modal>

      {/* Add Debt Modal */}
      <Modal
        opened={addDebtOpen}
        onClose={() => setAddDebtOpen(false)}
        title='Borç Ekle'
        centered
      >
        <Stack gap='sm'>
          <TextInput
            label='Borç Adı'
            placeholder='Banka Kredisi, Tedarikçi...'
            value={debtName}
            onChange={(e) => setDebtName(e.currentTarget.value)}
            data-testid='input-debt-name'
          />
          <Text size='sm' fw={500}>
            Toplam Borç
          </Text>
          <NumpadInput value={debtTotal} onChange={setDebtTotal} />
          <Text size='sm' fw={500}>
            Aylık Ödeme
          </Text>
          <NumpadInput value={debtMonthly} onChange={setDebtMonthly} />
          <TextInput
            label='Başlangıç Tarihi'
            value={debtStartDate}
            onChange={(e) => setDebtStartDate(e.currentTarget.value)}
          />
          <TextInput
            label='Not (isteğe bağlı)'
            value={debtNotes}
            onChange={(e) => setDebtNotes(e.currentTarget.value)}
          />
          <Button
            color='green'
            loading={addingDebt}
            disabled={!debtName.trim() || debtTotal === '0'}
            onClick={() => addDebt()}
            data-testid='btn-save-debt'
          >
            Kaydet
          </Button>
        </Stack>
      </Modal>

      {/* Add Payment Modal */}
      <Modal
        opened={addPaymentOpen}
        onClose={() => setAddPaymentOpen(false)}
        title='Ödeme Ekle'
        centered
      >
        <Stack gap='sm'>
          <NumpadInput value={paymentAmount} onChange={setPaymentAmount} />
          <TextInput
            label='Tarih'
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.currentTarget.value)}
          />
          <TextInput
            label='Not (isteğe bağlı)'
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.currentTarget.value)}
          />
          <Button
            color='green'
            loading={addingPayment}
            disabled={paymentAmount === '0'}
            onClick={() => addPayment()}
            data-testid='btn-save-payment'
          >
            Kaydet
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
```

---

## Task 9: Frontend tests

**Files:**
- Create: `frontend/src/pages/__tests__/GroceryFinance.test.tsx`
- Modify: `frontend/src/pages/__tests__/GroceryMain.test.tsx`

- [ ] **Step 1: Create `frontend/src/pages/__tests__/GroceryFinance.test.tsx`**

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
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  endpoints: {
    finance: '/api/grocery/finance/',
    debts: '/api/grocery/debts/',
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import { api } from '../../api';
import GroceryFinance from '../GroceryFinance';

const mockEntries = [
  {
    pk: 1,
    category: 'Kira',
    entry_type: 'expense',
    amount: '5000.00',
    date: '2026-04-01',
    is_recurring: true,
    notes: '',
  },
  {
    pk: 2,
    category: 'Bonus',
    entry_type: 'income',
    amount: '500.00',
    date: '2026-04-05',
    is_recurring: false,
    notes: '',
  },
];

const mockDebts = [
  {
    pk: 1,
    name: 'Banka Kredisi',
    total_amount: '50000.00',
    monthly_payment: '2000.00',
    start_date: '2026-01-01',
    is_active: true,
    remaining_amount: '44000.00',
    notes: '',
  },
];

const mockPayments = [
  { pk: 1, debt: 1, amount: '2000.00', date: '2026-02-01', notes: '' },
  { pk: 2, debt: 1, amount: '2000.00', date: '2026-03-01', notes: '' },
  { pk: 3, debt: 1, amount: '2000.00', date: '2026-04-01', notes: '' },
];

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <MantineProvider>
          <Notifications />
          <GroceryFinance />
        </MantineProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('GroceryFinance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.includes('debts') && url.includes('payments')) {
        return Promise.resolve({ data: mockPayments });
      }
      if (url.includes('debts')) return Promise.resolve({ data: mockDebts });
      return Promise.resolve({ data: mockEntries });
    });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.delete).mockResolvedValue({});
  });

  it('renders header with Borçlar & Giderler title', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Borçlar & Giderler')).toBeInTheDocument();
    });
  });

  it('shows Giderler / Gelirler and Borçlar tabs', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('tab-entries')).toBeInTheDocument();
      expect(screen.getByTestId('tab-debts')).toBeInTheDocument();
    });
  });

  it('renders finance entries in Giderler tab', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('entry-row-1')).toBeInTheDocument();
      expect(screen.getByText('Kira')).toBeInTheDocument();
      expect(screen.getByText('₺5000.00')).toBeInTheDocument();
    });
  });

  it('shows Aylık badge for recurring entry', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Aylık')).toBeInTheDocument();
    });
  });

  it('shows Gelir badge for income entry', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Gelir')).toBeInTheDocument();
    });
  });

  it('opens add entry modal when Ekle is clicked', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('btn-add-entry')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-entry'));
    await waitFor(() => {
      expect(screen.getByText('Kayıt Ekle')).toBeInTheDocument();
    });
  });

  it('submits new entry when form is filled and saved', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('btn-add-entry')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-entry'));
    await waitFor(() => expect(screen.getByTestId('input-entry-category')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('input-entry-category'), {
      target: { value: 'Elektrik' },
    });
    // Set amount via numpad: click '5' then '0' then '0'
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByTestId('btn-save-entry'));
    await waitFor(() => {
      expect(vi.mocked(api.post)).toHaveBeenCalledWith(
        '/api/grocery/finance/',
        expect.objectContaining({ category: 'Elektrik', entry_type: 'expense' })
      );
    });
  });

  it('navigates back when back button clicked', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('btn-back')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-back'));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('decrements month when prev-month clicked', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('month-label')).toBeInTheDocument());
    const labelBefore = screen.getByTestId('month-label').textContent;
    fireEvent.click(screen.getByTestId('btn-prev-month'));
    await waitFor(() => {
      expect(screen.getByTestId('month-label').textContent).not.toBe(labelBefore);
    });
  });

  it('switches to Borçlar tab and shows debt card', async () => {
    renderComponent();
    await waitFor(() => expect(screen.getByTestId('tab-debts')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('tab-debts'));
    await waitFor(() => {
      expect(screen.getByTestId('debt-card-1')).toBeInTheDocument();
      expect(screen.getByText('Banka Kredisi')).toBeInTheDocument();
    });
  });

  it('shows remaining amount on debt card', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => {
      expect(screen.getByText(/44000\.00.*50000\.00 kaldı/)).toBeInTheDocument();
    });
  });

  it('progress bar is rendered for debt', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => {
      expect(screen.getByTestId('debt-progress-1')).toBeInTheDocument();
    });
  });

  it('expands debt to show payments panel', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => expect(screen.getByTestId('debt-card-1')).toBeInTheDocument());
    // Click on the debt card header to expand
    fireEvent.click(screen.getByText('Banka Kredisi'));
    await waitFor(() => {
      expect(screen.getByTestId('debt-payments-1')).toBeInTheDocument();
    });
  });

  it('opens add payment modal pre-filled with monthly payment', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => expect(screen.getByTestId('debt-card-1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Banka Kredisi'));
    await waitFor(() => expect(screen.getByTestId('btn-add-payment-1')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-payment-1'));
    await waitFor(() => {
      expect(screen.getByText('Ödeme Ekle')).toBeInTheDocument();
      // Amount pre-filled with monthly_payment (2000.00)
      expect(screen.getByText('2000.00')).toBeInTheDocument();
    });
  });

  it('opens add debt modal', async () => {
    renderComponent();
    fireEvent.click(await screen.findByTestId('tab-debts'));
    await waitFor(() => expect(screen.getByTestId('btn-add-debt')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-add-debt'));
    await waitFor(() => {
      expect(screen.getByText('Borç Ekle')).toBeInTheDocument();
      expect(screen.getByTestId('input-debt-name')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Update `frontend/src/pages/__tests__/GroceryMain.test.tsx`**

Add `finance` and `debts` to the endpoints mock. Find:
```ts
  endpoints: {
    dashboard: '/api/grocery/dashboard/',
    saleRecords: '/api/grocery/sale-records/',
    marketPrices: '/api/market-prices/search/',
    profile: '/api/grocery/profile/',
  },
```
Replace with:
```ts
  endpoints: {
    dashboard: '/api/grocery/dashboard/',
    saleRecords: '/api/grocery/sale-records/',
    marketPrices: '/api/market-prices/search/',
    profile: '/api/grocery/profile/',
    finance: '/api/grocery/finance/',
    debts: '/api/grocery/debts/',
  },
```

Add finance fields to `mockStats`. Find:
```ts
const mockStats = {
  total_sales: 150.50,
  net_profit: 45.00,
  low_stock: [],
};
```
Replace with:
```ts
const mockStats = {
  total_sales: 150.50,
  net_profit: 45.00,
  low_stock: [],
  monthly_expenses: 3000.00,
  monthly_income_extra: 0,
  total_debt_remaining: 44000.00,
};
```

Add two new tests before the closing `});` of the describe block:
```ts
  it('shows finance summary cards', async () => {
    renderComponent();
    await waitFor(() => {
      expect(screen.getByTestId('stat-monthly-expenses')).toBeInTheDocument();
      expect(screen.getByTestId('stat-debt-remaining')).toBeInTheDocument();
    });
  });

  it('btn-finance navigates to /finance', async () => {
    renderComponent();
    const btn = await screen.findByTestId('btn-finance');
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith('/finance');
  });
```

- [ ] **Step 3: Run all frontend tests**

```bash
cd /mnt/2tb_ssd/Macir/frontend
npm run test
```

Expected: all tests pass, including new GroceryFinance tests and updated GroceryMain tests.

- [ ] **Step 4: TypeScript check**

```bash
cd /mnt/2tb_ssd/Macir/frontend
npm run build
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 5: Commit frontend**

```bash
cd /mnt/2tb_ssd/Macir
git add frontend/src/types.ts frontend/src/api.ts \
        frontend/src/App.tsx frontend/src/pages/GroceryMain.tsx \
        frontend/src/pages/GroceryFinance.tsx \
        frontend/src/pages/__tests__/GroceryFinance.test.tsx \
        frontend/src/pages/__tests__/GroceryMain.test.tsx
git commit -m "feat: add GroceryFinance page and finance summary to GroceryMain"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `FinanceEntry` model (expense/income, category, recurring, date)
- ✅ `Debt` model (total, monthly, remaining balance)
- ✅ `DebtPayment` model
- ✅ Lazy recurring creation on GET
- ✅ Overpayment validation (400 with Turkish error)
- ✅ Dashboard: `monthly_expenses`, `monthly_income_extra`, `total_debt_remaining`
- ✅ `GET/POST /api/grocery/finance/` + `DELETE /api/grocery/finance/<pk>/`
- ✅ `GET/POST /api/grocery/debts/` + `PATCH /api/grocery/debts/<pk>/`
- ✅ `GET/POST /api/grocery/debts/<pk>/payments/`
- ✅ `?include_inactive=true` param on debts
- ✅ `?month=YYYY-MM` param on finance
- ✅ GroceryFinance page with two tabs
- ✅ Month navigator on entries tab
- ✅ Add entry modal (category, type toggle, amount, recurring switch, date, notes)
- ✅ Add debt modal (name, total, monthly, start_date, notes)
- ✅ Progress bar on debt cards
- ✅ Add payment modal pre-filled with monthly_payment
- ✅ "Kapat" action on debts (sets is_active=False)
- ✅ Finance summary cards on GroceryMain (`stat-monthly-expenses`, `stat-debt-remaining`)
- ✅ "Borçlar & Giderler" button on GroceryMain navigating to `/finance`
- ✅ Backend tests: CRUD, ownership isolation, recurring logic, overpayment, dashboard
- ✅ Frontend tests: render, add entry, add debt, add payment, month nav, progress bar

**Type consistency:** `FinanceEntry`, `Debt`, `DebtPayment` interfaces defined in Task 6 and used identically in Task 8 and Task 9. `endpoints.finance` and `endpoints.debts` match URL patterns registered in Task 3.

**No placeholders found.**
