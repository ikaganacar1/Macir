"""Serializers for the Grocery API."""

from django.db import transaction
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
        return obj.stock_level

    def get_most_recent_purchase_price(self, obj):
        return obj.most_recent_purchase_price


class StockEntryItemSerializer(serializers.ModelSerializer):
    """Serializer for StockEntryItem."""

    class Meta:
        model = StockEntryItem
        fields = ['pk', 'product', 'quantity', 'purchase_price']


class StockEntrySerializer(serializers.ModelSerializer):
    """Serializer for StockEntry with nested items."""

    items = StockEntryItemSerializer(many=True)

    class Meta:
        model = StockEntry
        fields = ['pk', 'date', 'notes', 'items']

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

    class Meta:
        model = SaleRecord
        fields = ['pk', 'date', 'notes', 'items']

    def validate_items(self, value):
        """Require at least one item per sale record."""
        if not value:
            raise serializers.ValidationError('At least one item is required.')
        return value

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
