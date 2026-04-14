"""Serializers for the Grocery API."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from grocery.models import (
    Category,
    Debt,
    DebtPayment,
    FinanceEntry,
    Product,
    ReturnItem,
    SaleItem,
    SaleRecord,
    StockEntry,
    StockEntryItem,
    StoreProfile,
    WasteItem,
)


class CategorySerializer(serializers.ModelSerializer):
    """Serializer for Category."""

    class Meta:
        model = Category
        fields = ['pk', 'name', 'order']


class ProductSerializer(serializers.ModelSerializer):
    """Serializer for Product, including computed stock_level."""

    stock_level = serializers.SerializerMethodField()
    most_recent_purchase_price = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Product
        fields = [
            'pk',
            'name',
            'category',
            'category_name',
            'unit',
            'sell_price',
            'svg_icon',
            'low_stock_threshold',
            'expiry_note',
            'is_active',
            'stock_level',
            'most_recent_purchase_price',
        ]

    def get_stock_level(self, obj):
        # Use annotated value if available (from _annotate_products), else fall back to property
        if hasattr(obj, '_stock_level'):
            return obj._stock_level
        return obj.stock_level

    def get_most_recent_purchase_price(self, obj):
        if hasattr(obj, '_most_recent_purchase_price'):
            return obj._most_recent_purchase_price
        return obj.most_recent_purchase_price

    def validate_svg_icon(self, value):
        allowed = {'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'}
        if value and hasattr(value, 'content_type') and value.content_type not in allowed:
            raise serializers.ValidationError('Desteklenmeyen dosya türü.')
        return value


class StockEntryItemSerializer(serializers.ModelSerializer):
    """Serializer for StockEntryItem."""

    class Meta:
        model = StockEntryItem
        fields = ['pk', 'product', 'quantity', 'purchase_price']


class StockEntrySerializer(serializers.ModelSerializer):
    """Serializer for StockEntry with nested items."""

    items = StockEntryItemSerializer(many=True)
    date = serializers.DateField(required=False)

    class Meta:
        model = StockEntry
        fields = ['pk', 'date', 'notes', 'items']

    def validate_date(self, value):
        return value or timezone.localdate()

    def to_internal_value(self, data):
        if 'date' not in data or not data['date']:
            data = {**data, 'date': str(timezone.localdate())}
        return super().to_internal_value(data)

    def validate_items(self, value):
        """Require at least one item per stock entry. Reject products not owned by the user."""
        if not value:
            raise serializers.ValidationError('At least one item is required.')
        request = self.context.get('request')
        if request:
            for item in value:
                if item['product'].owner != request.user:
                    raise serializers.ValidationError('Geçersiz ürün.')
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        with transaction.atomic():
            entry = StockEntry.objects.create(**validated_data)
            for item in items_data:
                StockEntryItem.objects.create(entry=entry, **item)
        return entry

    def update(self, instance, validated_data):
        validated_data.pop('items', None)  # items are immutable after creation
        return super().update(instance, validated_data)


class SaleItemSerializer(serializers.ModelSerializer):
    """Serializer for SaleItem."""

    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = SaleItem
        fields = ['pk', 'product', 'product_name', 'quantity', 'sell_price']


class SaleRecordSerializer(serializers.ModelSerializer):
    """Serializer for SaleRecord with nested items."""

    items = SaleItemSerializer(many=True)
    date = serializers.DateField(required=False)

    class Meta:
        model = SaleRecord
        fields = ['pk', 'date', 'notes', 'items']

    def to_internal_value(self, data):
        if 'date' not in data or not data['date']:
            data = {**data, 'date': str(timezone.localdate())}
        return super().to_internal_value(data)

    def validate_items(self, value):
        """Require at least one item per sale record. Reject products not owned by the user."""
        if not value:
            raise serializers.ValidationError('At least one item is required.')
        request = self.context.get('request')
        if request:
            for item in value:
                if item['product'].owner != request.user:
                    raise serializers.ValidationError('Geçersiz ürün.')
        return value

    def validate(self, data):
        """Check that no item would cause negative stock."""
        request = self.context.get('request')
        items = data.get('items', [])
        errors = []
        for item in items:
            product = item['product']
            qty = item['quantity']
            received = StockEntryItem.objects.filter(
                product=product,
                **({'entry__owner': request.user} if request else {})
            ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
            sold = SaleItem.objects.filter(
                product=product,
                **({'sale__owner': request.user} if request else {})
            ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
            wasted = WasteItem.objects.filter(
                product=product,
                **({'entry__owner': request.user} if request else {})
            ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
            returned = ReturnItem.objects.filter(
                product=product,
                **({'record__owner': request.user} if request else {})
            ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
            available = received + returned - sold - wasted
            if qty > available:
                errors.append(
                    f'{product.name}: stok yetersiz ({available} mevcut, {qty} istendi)'
                )
        if errors:
            raise serializers.ValidationError({'items': errors})
        return data

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        with transaction.atomic():
            sale = SaleRecord.objects.create(**validated_data)
            for item in items_data:
                SaleItem.objects.create(sale=sale, **item)
        return sale

    def update(self, instance, validated_data):
        validated_data.pop('items', None)  # items are immutable after creation
        return super().update(instance, validated_data)


class StoreProfileSerializer(serializers.ModelSerializer):
    search_radius_km = serializers.IntegerField(min_value=1, max_value=10)

    class Meta:
        model = StoreProfile
        fields = ['latitude', 'longitude', 'search_radius_km']


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
        paid = obj.payments.aggregate(total=Sum('amount'))['total'] or Decimal('0')
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
