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
