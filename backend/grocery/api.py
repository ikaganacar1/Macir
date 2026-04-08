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
    StoreProfile,
)
from grocery.serializers import (
    CategorySerializer,
    ProductSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
    StoreProfileSerializer,
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
        return StockEntry.objects.filter(owner=self.request.user).prefetch_related('items__product')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class StockEntryDetail(generics.RetrieveAPIView):
    serializer_class = StockEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return StockEntry.objects.filter(owner=self.request.user).prefetch_related('items__product')


class SaleRecordList(generics.ListCreateAPIView):
    serializer_class = SaleRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SaleRecord.objects.filter(owner=self.request.user).order_by('-date', '-pk').prefetch_related('items__product')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class SaleRecordDetail(generics.RetrieveAPIView):
    serializer_class = SaleRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SaleRecord.objects.filter(owner=self.request.user).prefetch_related('items__product')


def _compute_stock_levels(user, active_only=True):
    """
    Compute stock level per product for a given user using bulk queries (not N+2).
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


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_or_create_profile(self, user):
        profile, _ = StoreProfile.objects.get_or_create(owner=user)
        return profile

    def get(self, request):
        profile = self._get_or_create_profile(request.user)
        return Response(StoreProfileSerializer(profile).data)

    def patch(self, request):
        profile = self._get_or_create_profile(request.user)
        serializer = StoreProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


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
]
