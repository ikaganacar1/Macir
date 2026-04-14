# src/backend/InvenTree/grocery/api.py
"""REST API views for the Grocery module."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import DecimalField, ExpressionWrapper, F, OuterRef, Subquery, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.urls import path
from django.utils.dateparse import parse_date

from rest_framework import generics
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
from grocery.serializers import (
    CategorySerializer,
    DebtPaymentSerializer,
    DebtSerializer,
    FinanceEntrySerializer,
    ProductSerializer,
    ReturnRecordSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
    StoreProfileSerializer,
    WasteEntrySerializer,
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
    wasted_sq = Coalesce(
        Subquery(
            WasteItem.objects.filter(product_id=OuterRef('pk'))
            .values('product_id')
            .annotate(total=Sum('quantity'))
            .values('total')[:1],
            output_field=DecimalField(),
        ),
        Decimal('0'),
        output_field=DecimalField(),
    )
    returned_sq = Coalesce(
        Subquery(
            ReturnItem.objects.filter(product_id=OuterRef('pk'))
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
        _stock_level=ExpressionWrapper(
            received_sq + returned_sq - sold_sq - wasted_sq,
            output_field=DecimalField(),
        ),
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


class WasteEntryList(generics.ListCreateAPIView):
    serializer_class = WasteEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WasteEntry.objects.filter(owner=self.request.user).prefetch_related('items__product')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class WasteEntryDetail(generics.RetrieveAPIView):
    serializer_class = WasteEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return WasteEntry.objects.filter(owner=self.request.user).prefetch_related('items__product')


class ReturnRecordList(generics.ListCreateAPIView):
    serializer_class = ReturnRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ReturnRecord.objects.filter(owner=self.request.user).prefetch_related('items__product')

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ReturnRecordDetail(generics.RetrieveAPIView):
    serializer_class = ReturnRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ReturnRecord.objects.filter(owner=self.request.user).prefetch_related('items__product')


class SaleRecordList(generics.ListCreateAPIView):
    serializer_class = SaleRecordSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = SaleRecord.objects.filter(owner=self.request.user).order_by('-date', '-pk').prefetch_related('items__product')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            try:
                qs = qs.filter(date__gte=date_from)
            except (ValueError, Exception):
                pass
        if date_to:
            try:
                qs = qs.filter(date__lte=date_to)
            except (ValueError, Exception):
                pass
        return qs

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
    Returns a tuple: (received_map, sold_map, wasted_map, returned_map).
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
    wasted_map = {
        w['product_id']: w['total']
        for w in WasteItem.objects.filter(**product_filter)
        .values('product_id')
        .annotate(total=Sum('quantity'))
    }
    returned_map = {
        r['product_id']: r['total']
        for r in ReturnItem.objects.filter(**product_filter)
        .values('product_id')
        .annotate(total=Sum('quantity'))
    }
    return received_map, sold_map, wasted_map, returned_map


def _create_missing_recurring(user):
    """Lazily create current-month entries for all recurring FinanceEntry templates."""
    istanbul = ZoneInfo('Europe/Istanbul')
    today = datetime.now(istanbul).date()
    month_start = today.replace(day=1)

    templates = {}
    for entry in FinanceEntry.objects.filter(owner=user, is_recurring=True).order_by('-date'):
        key = (entry.category, entry.entry_type)
        if key not in templates:
            templates[key] = entry

    for (category, entry_type), template in templates.items():
        FinanceEntry.objects.get_or_create(
            owner=user,
            category=category,
            entry_type=entry_type,
            is_recurring=True,
            date=month_start,
            defaults={'amount': template.amount, 'notes': template.notes},
        )


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

        received_map, sold_map, wasted_map, returned_map = _compute_stock_levels(user, active_only=True)
        low_stock = []
        for p in Product.objects.filter(owner=user, is_active=True).values(
            'pk', 'name', 'unit', 'low_stock_threshold'
        ):
            level = (
                received_map.get(p['pk'], Decimal('0'))
                + returned_map.get(p['pk'], Decimal('0'))
                - sold_map.get(p['pk'], Decimal('0'))
                - wasted_map.get(p['pk'], Decimal('0'))
            )
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

        month_start_istanbul = today.replace(day=1)

        monthly_expenses = FinanceEntry.objects.filter(
            owner=user,
            entry_type=FinanceEntry.EXPENSE,
            date__gte=month_start_istanbul,
            date__lte=today,
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField())
        )['total']

        monthly_income_extra = FinanceEntry.objects.filter(
            owner=user,
            entry_type=FinanceEntry.INCOME,
            date__gte=month_start_istanbul,
            date__lte=today,
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

        cash_sales = SaleItem.objects.filter(
            sale__date__range=(start, end),
            sale__owner=user,
            sale__payment_method='cash',
        ).aggregate(
            total=Coalesce(
                Sum(ExpressionWrapper(F('quantity') * F('sell_price'), output_field=DecimalField())),
                Decimal('0'),
                output_field=DecimalField(),
            )
        )['total']

        card_sales = SaleItem.objects.filter(
            sale__date__range=(start, end),
            sale__owner=user,
            sale__payment_method='card',
        ).aggregate(
            total=Coalesce(
                Sum(ExpressionWrapper(F('quantity') * F('sell_price'), output_field=DecimalField())),
                Decimal('0'),
                output_field=DecimalField(),
            )
        )['total']

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
            'cash_sales': cash_sales,
            'card_sales': card_sales,
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


class FinanceEntryDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FinanceEntrySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return FinanceEntry.objects.filter(owner=self.request.user)


def _annotate_debts(qs):
    """Annotate a Debt queryset with remaining_amount."""
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
        self._get_debt()  # raises 404 if debt not owned by request.user
        return DebtPayment.objects.filter(
            debt__owner=self.request.user,
            debt_id=self.kwargs['debt_pk'],
        )

    def perform_create(self, serializer):
        with transaction.atomic():
            debt = get_object_or_404(Debt.objects.select_for_update(), pk=self.kwargs['debt_pk'], owner=self.request.user)
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
    path('waste-entries/', WasteEntryList.as_view(), name='api-grocery-waste-entry-list'),
    path('waste-entries/<int:pk>/', WasteEntryDetail.as_view(), name='api-grocery-waste-entry-detail'),
    path('returns/', ReturnRecordList.as_view(), name='api-grocery-return-record-list'),
    path('returns/<int:pk>/', ReturnRecordDetail.as_view(), name='api-grocery-return-record-detail'),
]
