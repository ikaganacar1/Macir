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
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class CategoryDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class ProductList(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Default: active products only. Pass ?active=false to include inactive (for management UI).
        active_param = self.request.query_params.get('active', 'true')
        if active_param.lower() == 'false':
            qs = Product.objects.all()
        else:
            qs = Product.objects.filter(is_active=True)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category_id=category)
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(name__icontains=search)
        return qs


class ProductDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]


class StockEntryList(generics.ListCreateAPIView):
    queryset = StockEntry.objects.all()
    serializer_class = StockEntrySerializer
    permission_classes = [IsAuthenticated]


class StockEntryDetail(generics.RetrieveAPIView):
    queryset = StockEntry.objects.all()
    serializer_class = StockEntrySerializer
    permission_classes = [IsAuthenticated]


class SaleRecordList(generics.ListCreateAPIView):
    queryset = SaleRecord.objects.all()
    serializer_class = SaleRecordSerializer
    permission_classes = [IsAuthenticated]


class SaleRecordDetail(generics.RetrieveAPIView):
    queryset = SaleRecord.objects.all()
    serializer_class = SaleRecordSerializer
    permission_classes = [IsAuthenticated]


def _compute_stock_levels(active_only=True):
    """
    Compute stock level per product using 3 queries (not N×2).
    Returns a dict: {product_id: Decimal stock_level}.
    """
    filter_kw = {'product__is_active': True} if active_only else {}
    received_map = {
        r['product_id']: r['total']
        for r in StockEntryItem.objects.filter(**filter_kw)
        .values('product_id')
        .annotate(total=Sum('quantity'))
    }
    sold_map = {
        s['product_id']: s['total']
        for s in SaleItem.objects.filter(**filter_kw)
        .values('product_id')
        .annotate(total=Sum('quantity'))
    }
    return received_map, sold_map



class DashboardView(APIView):
    """Aggregated stats for the dashboard."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
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

        sale_items = SaleItem.objects.filter(sale__date__range=(start, end))

        total_sales = sale_items.aggregate(
            total=Coalesce(
                Sum(ExpressionWrapper(F('quantity') * F('sell_price'), output_field=DecimalField())),
                Decimal('0'),
                output_field=DecimalField(),
            )
        )['total']

        # Correct profit: (sell_price - most_recent_purchase_price) × quantity per sale item.
        # Use a subquery to get the latest purchase price for each product at query time.
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

        # Low stock: compute all stock levels with 3 queries (not N×2).
        received_map, sold_map = _compute_stock_levels(active_only=True)
        low_stock = []
        for p in Product.objects.filter(is_active=True).values(
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

        # 7-day chart: single aggregation query.
        chart_start = today - timedelta(days=6)
        chart_qs = (
            SaleItem.objects.filter(sale__date__range=(chart_start, today))
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
            'cost_of_stock': None,  # removed: was inaccurate (stock-in-range ≠ COGS)
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
