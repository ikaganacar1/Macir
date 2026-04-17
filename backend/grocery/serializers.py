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
    ReturnRecord,
    SaleItem,
    SaleRecord,
    StockEntry,
    StockEntryItem,
    StoreProfile,
    WasteEntry,
    WasteItem,
)


def _available_stock(product, request):
    """Compute available stock for a product as received + returned - sold - wasted."""
    owner_filter = {'entry__owner': request.user} if request else {}
    received = StockEntryItem.objects.filter(
        product=product, **owner_filter
    ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
    sold = SaleItem.objects.filter(
        product=product,
        **({'sale__owner': request.user} if request else {}),
    ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
    wasted = WasteItem.objects.filter(
        product=product, **owner_filter
    ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
    returned = ReturnItem.objects.filter(
        product=product,
        **({'record__owner': request.user} if request else {}),
    ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
    return received + returned - sold - wasted


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
        # Intentionally excludes image/svg+xml: SVG can contain <script> and execute
        # under the same origin when served from /media/.
        allowed = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}
        if value and hasattr(value, 'content_type') and value.content_type not in allowed:
            raise serializers.ValidationError('Desteklenmeyen dosya türü.')
        return value

    def validate_category(self, value):
        request = self.context.get('request')
        if value is not None and request and value.owner != request.user:
            raise serializers.ValidationError('Geçersiz kategori.')
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
        fields = ['pk', 'date', 'payment_method', 'notes', 'items']

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

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        with transaction.atomic():
            request = self.context.get('request')
            # Lock products in deterministic order to prevent TOCTOU race with
            # concurrent sale/waste creates oversubscribing stock.
            product_ids = sorted({item['product'].pk for item in items_data})
            list(Product.objects.select_for_update().filter(pk__in=product_ids))
            errors = []
            for item in items_data:
                product = item['product']
                qty = item['quantity']
                available = _available_stock(product, request)
                if qty > available:
                    errors.append(
                        f'{product.name}: stok yetersiz ({available} mevcut, {qty} istendi)'
                    )
            if errors:
                raise serializers.ValidationError({'items': errors})
            sale = SaleRecord.objects.create(**validated_data)
            for item in items_data:
                SaleItem.objects.create(sale=sale, **item)
        return sale

    def update(self, instance, validated_data):
        validated_data.pop('items', None)  # items are immutable after creation
        return super().update(instance, validated_data)


class WasteItemSerializer(serializers.ModelSerializer):
    """Serializer for WasteItem."""

    class Meta:
        model = WasteItem
        fields = ['pk', 'product', 'quantity', 'reason']


class WasteEntrySerializer(serializers.ModelSerializer):
    """Serializer for WasteEntry with nested items."""

    items = WasteItemSerializer(many=True)
    date = serializers.DateField(required=False)

    class Meta:
        model = WasteEntry
        fields = ['pk', 'date', 'notes', 'items']

    def to_internal_value(self, data):
        if 'date' not in data or not data['date']:
            data = {**data, 'date': str(timezone.localdate())}
        return super().to_internal_value(data)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('En az bir ürün gerekli.')
        request = self.context.get('request')
        if request:
            for item in value:
                if item['product'].owner != request.user:
                    raise serializers.ValidationError('Geçersiz ürün.')
        return value

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        with transaction.atomic():
            request = self.context.get('request')
            product_ids = sorted({item['product'].pk for item in items_data})
            list(Product.objects.select_for_update().filter(pk__in=product_ids))
            errors = []
            for item in items_data:
                product = item['product']
                qty = item['quantity']
                available = _available_stock(product, request)
                if qty > available:
                    errors.append(
                        f'{product.name}: stok yetersiz ({available} mevcut, {qty} istendi)'
                    )
            if errors:
                raise serializers.ValidationError({'items': errors})
            entry = WasteEntry.objects.create(**validated_data)
            for item in items_data:
                WasteItem.objects.create(entry=entry, **item)
        return entry

    def update(self, instance, validated_data):
        validated_data.pop('items', None)
        return super().update(instance, validated_data)


class ReturnItemSerializer(serializers.ModelSerializer):
    """Serializer for ReturnItem."""

    class Meta:
        model = ReturnItem
        fields = ['pk', 'product', 'quantity', 'refund_price']


class ReturnRecordSerializer(serializers.ModelSerializer):
    """Serializer for ReturnRecord with nested items."""

    items = ReturnItemSerializer(many=True)
    date = serializers.DateField(required=False)

    class Meta:
        model = ReturnRecord
        fields = ['pk', 'date', 'original_sale', 'notes', 'items']

    def to_internal_value(self, data):
        if 'date' not in data or not data['date']:
            data = {**data, 'date': str(timezone.localdate())}
        return super().to_internal_value(data)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('En az bir ürün gerekli.')
        request = self.context.get('request')
        if request:
            for item in value:
                if item['product'].owner != request.user:
                    raise serializers.ValidationError('Geçersiz ürün.')
        return value

    def validate_original_sale(self, value):
        """Ensure original_sale belongs to the requesting user."""
        request = self.context.get('request')
        if value and request and value.owner != request.user:
            raise serializers.ValidationError('Geçersiz satış kaydı.')
        return value

    def validate(self, data):
        """Reject returning more than has been sold (minus prior returns) for each product."""
        request = self.context.get('request')
        items = data.get('items', [])
        requested = {}
        for item in items:
            pk = item['product'].pk
            requested[pk] = requested.get(pk, Decimal('0')) + item['quantity']
        errors = []
        for product_pk, qty in requested.items():
            sold = SaleItem.objects.filter(
                product_id=product_pk,
                **({'sale__owner': request.user} if request else {}),
            ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
            already_returned = ReturnItem.objects.filter(
                product_id=product_pk,
                **({'record__owner': request.user} if request else {}),
            ).aggregate(total=Sum('quantity'))['total'] or Decimal('0')
            refundable = sold - already_returned
            if qty > refundable:
                name = Product.objects.filter(pk=product_pk).values_list('name', flat=True).first() or '?'
                errors.append(
                    f'{name}: iade miktarı satılan miktardan fazla ({refundable} iade edilebilir, {qty} istendi)'
                )
        if errors:
            raise serializers.ValidationError({'items': errors})
        return data

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        with transaction.atomic():
            product_ids = sorted({item['product'].pk for item in items_data})
            list(Product.objects.select_for_update().filter(pk__in=product_ids))
            record = ReturnRecord.objects.create(**validated_data)
            for item in items_data:
                ReturnItem.objects.create(record=record, **item)
        return record

    def update(self, instance, validated_data):
        validated_data.pop('items', None)
        return super().update(instance, validated_data)


class StoreProfileSerializer(serializers.ModelSerializer):
    search_radius_km = serializers.IntegerField(min_value=1, max_value=10)
    latitude = serializers.FloatField(min_value=-90.0, max_value=90.0)
    longitude = serializers.FloatField(min_value=-180.0, max_value=180.0)

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
