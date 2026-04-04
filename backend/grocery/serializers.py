"""Serializers for the Grocery API."""

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from grocery.models import (
    Category,
    Product,
    SaleItem,
    SaleRecord,
    StockEntry,
    StockEntryItem,
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
        """Require at least one item per stock entry."""
        if not value:
            raise serializers.ValidationError('At least one item is required.')
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

    class Meta:
        model = SaleItem
        fields = ['pk', 'product', 'quantity', 'sell_price']


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
        """Require at least one item per sale record."""
        if not value:
            raise serializers.ValidationError('At least one item is required.')
        return value

    def validate(self, data):
        """Check that no item would cause negative stock."""
        items = data.get('items', [])
        errors = []
        for item in items:
            product = item['product']
            qty = item['quantity']
            received = StockEntryItem.objects.filter(product=product).aggregate(
                total=Sum('quantity')
            )['total'] or Decimal('0')
            sold = SaleItem.objects.filter(product=product).aggregate(
                total=Sum('quantity')
            )['total'] or Decimal('0')
            available = received - sold
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
