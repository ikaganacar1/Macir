# src/backend/InvenTree/grocery/models.py
"""Database models for the Grocery module."""

from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Sum
from django.utils.translation import gettext_lazy as _

# Smallest quantity with 3dp is 0.001; reject zero and negative line items.
POSITIVE_QTY = Decimal('0.001')


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
        """Current stock = received + returned − sold − wasted."""
        received = (
            StockEntryItem.objects.filter(product=self)
            .aggregate(total=Sum('quantity'))['total'] or 0
        )
        sold = (
            SaleItem.objects.filter(product=self)
            .aggregate(total=Sum('quantity'))['total'] or 0
        )
        wasted = (
            WasteItem.objects.filter(product=self)
            .aggregate(total=Sum('quantity'))['total'] or 0
        )
        returned = (
            ReturnItem.objects.filter(product=self)
            .aggregate(total=Sum('quantity'))['total'] or 0
        )
        return received + returned - sold - wasted

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
        validators=[MinValueValidator(POSITIVE_QTY)],
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
    PAYMENT_CASH = 'cash'
    PAYMENT_CARD = 'card'
    PAYMENT_CHOICES = [(PAYMENT_CASH, 'Nakit'), (PAYMENT_CARD, 'Kart')]
    payment_method = models.CharField(
        max_length=10,
        choices=PAYMENT_CHOICES,
        default=PAYMENT_CASH,
        verbose_name=_('Payment Method'),
    )

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
        validators=[MinValueValidator(POSITIVE_QTY)],
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


class WasteEntry(models.Model):
    """A spoilage/waste recording session."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='waste_entries',
        verbose_name=_('Owner'),
    )
    date = models.DateField(verbose_name=_('Date'))
    notes = models.TextField(blank=True, default='', verbose_name=_('Notes'))

    class Meta:
        ordering = ['-date', '-pk']
        verbose_name = _('Waste Entry')
        verbose_name_plural = _('Waste Entries')

    def __str__(self):
        return f'Waste {self.date}'


class WasteItem(models.Model):
    """One product line within a WasteEntry."""

    REASON_SPOILED = 'spoiled'
    REASON_DAMAGED = 'damaged'
    REASON_EXPIRED = 'expired'
    REASON_OTHER = 'other'
    REASON_CHOICES = [
        (REASON_SPOILED, 'Bozuldu'),
        (REASON_DAMAGED, 'Hasarlı'),
        (REASON_EXPIRED, 'Son kullanma tarihi geçti'),
        (REASON_OTHER, 'Diğer'),
    ]

    entry = models.ForeignKey(
        WasteEntry,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Entry'),
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='waste_items',
        verbose_name=_('Product'),
    )
    quantity = models.DecimalField(
        max_digits=10, decimal_places=3, verbose_name=_('Quantity'),
        validators=[MinValueValidator(POSITIVE_QTY)],
    )
    reason = models.CharField(
        max_length=20,
        choices=REASON_CHOICES,
        default=REASON_SPOILED,
        verbose_name=_('Reason'),
    )

    class Meta:
        verbose_name = _('Waste Item')
        verbose_name_plural = _('Waste Items')

    def __str__(self):
        return f'{self.product.name} x{self.quantity} ({self.reason})'


class ReturnRecord(models.Model):
    """A customer return/refund session."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='return_records',
        verbose_name=_('Owner'),
    )
    date = models.DateField(verbose_name=_('Date'))
    original_sale = models.ForeignKey(
        SaleRecord,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='returns',
        verbose_name=_('Original Sale'),
    )
    notes = models.TextField(blank=True, default='', verbose_name=_('Notes'))

    class Meta:
        ordering = ['-date', '-pk']
        verbose_name = _('Return Record')
        verbose_name_plural = _('Return Records')

    def __str__(self):
        return f'Return {self.date}'


class ReturnItem(models.Model):
    """One product line within a ReturnRecord."""

    record = models.ForeignKey(
        ReturnRecord,
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name=_('Record'),
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='return_items',
        verbose_name=_('Product'),
    )
    quantity = models.DecimalField(
        max_digits=10, decimal_places=3, verbose_name=_('Quantity'),
        validators=[MinValueValidator(POSITIVE_QTY)],
    )
    refund_price = models.DecimalField(
        max_digits=10, decimal_places=2, verbose_name=_('Refund Price per Unit'),
        validators=[MinValueValidator(0)],
    )

    class Meta:
        verbose_name = _('Return Item')
        verbose_name_plural = _('Return Items')

    def __str__(self):
        return f'{self.product.name} x{self.quantity} @ {self.refund_price}'


class StoreProfile(models.Model):
    """Per-user store location for market price proximity searches."""

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='store_profile',
    )
    latitude = models.FloatField(default=41.0082)   # Istanbul default
    longitude = models.FloatField(default=28.9784)  # Istanbul default
    search_radius_km = models.IntegerField(default=5)

    class Meta:
        verbose_name = 'Mağaza Profili'
        verbose_name_plural = 'Mağaza Profilleri'

    def __str__(self):
        return f"{self.owner.username} store profile"


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
