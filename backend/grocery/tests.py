# src/backend/InvenTree/grocery/tests.py
"""Tests for the Grocery module."""

import json
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase

from rest_framework import status as drf_status
from rest_framework.test import APITestCase

from grocery.models import Category, Product, SaleItem, SaleRecord, StockEntry, StockEntryItem
from grocery.serializers import (
    CategorySerializer,
    ProductSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
)


class CategoryModelTest(TestCase):
    """Tests for the Category model."""

    def test_create_category(self):
        cat = Category.objects.create(name='Vegetables', order=1)
        self.assertEqual(str(cat), 'Vegetables')
        self.assertEqual(cat.order, 1)


class ProductModelTest(TestCase):
    """Tests for the Product model."""

    def setUp(self):
        self.cat = Category.objects.create(name='Fruits', order=1)

    def test_create_product(self):
        p = Product.objects.create(
            name='Tomato',
            category=self.cat,
            unit='kg',
            sell_price='18.00',
            low_stock_threshold='5.00',
        )
        self.assertEqual(str(p), 'Tomato')
        self.assertEqual(p.unit, 'kg')
        self.assertTrue(p.is_active)

    def test_stock_level_starts_at_zero(self):
        p = Product.objects.create(
            name='Cucumber', category=self.cat, unit='kg', sell_price='12.00'
        )
        self.assertEqual(p.stock_level, 0)

    def test_stock_level_after_entry(self):
        p = Product.objects.create(
            name='Lemon', category=self.cat, unit='kg', sell_price='25.00'
        )
        entry = StockEntry.objects.create(date='2026-04-01')
        StockEntryItem.objects.create(
            entry=entry, product=p, quantity='10.00', purchase_price='15.00'
        )
        self.assertEqual(p.stock_level, 10)

    def test_stock_level_after_sale(self):
        p = Product.objects.create(
            name='Banana', category=self.cat, unit='kg', sell_price='22.00'
        )
        entry = StockEntry.objects.create(date='2026-04-01')
        StockEntryItem.objects.create(
            entry=entry, product=p, quantity='20.00', purchase_price='14.00'
        )
        sale = SaleRecord.objects.create(date='2026-04-01')
        SaleItem.objects.create(
            sale=sale, product=p, quantity='3.00', sell_price='22.00'
        )
        self.assertEqual(p.stock_level, 17)

    def test_most_recent_purchase_price(self):
        p = Product.objects.create(
            name='Onion', category=self.cat, unit='kg', sell_price='8.00'
        )
        entry1 = StockEntry.objects.create(date='2026-03-25')
        StockEntryItem.objects.create(
            entry=entry1, product=p, quantity='10.00', purchase_price='5.00'
        )
        entry2 = StockEntry.objects.create(date='2026-04-01')
        StockEntryItem.objects.create(
            entry=entry2, product=p, quantity='10.00', purchase_price='6.00'
        )
        self.assertEqual(p.most_recent_purchase_price, 6)


class SerializerTest(TestCase):
    """Tests for Grocery serializers."""

    def setUp(self):
        self.cat = Category.objects.create(name='Vegetables', order=1)
        self.product = Product.objects.create(
            name='Tomato', category=self.cat, unit='kg', sell_price='18.00'
        )

    def test_category_serializer(self):
        s = CategorySerializer(self.cat)
        self.assertEqual(s.data['name'], 'Vegetables')

    def test_product_serializer_includes_stock_level(self):
        s = ProductSerializer(self.product)
        self.assertIn('stock_level', s.data)
        self.assertEqual(float(s.data['stock_level']), 0)

    def test_stock_entry_serializer_nested(self):
        entry = StockEntry.objects.create(date='2026-04-01')
        StockEntryItem.objects.create(
            entry=entry, product=self.product, quantity='10.00', purchase_price='12.00'
        )
        s = StockEntrySerializer(entry)
        self.assertEqual(len(s.data['items']), 1)
        self.assertEqual(s.data['items'][0]['product'], self.product.pk)

    def test_sale_record_serializer_nested(self):
        sale = SaleRecord.objects.create(date='2026-04-01')
        SaleItem.objects.create(
            sale=sale, product=self.product, quantity='2.50', sell_price='18.00'
        )
        s = SaleRecordSerializer(sale)
        self.assertEqual(len(s.data['items']), 1)
        self.assertEqual(float(s.data['items'][0]['quantity']), 2.5)

    def test_stock_entry_requires_items(self):
        s = StockEntrySerializer(data={'date': '2026-04-01', 'notes': '', 'items': []})
        self.assertFalse(s.is_valid())
        self.assertIn('items', s.errors)

    def test_sale_record_requires_items(self):
        s = SaleRecordSerializer(data={'date': '2026-04-01', 'notes': '', 'items': []})
        self.assertFalse(s.is_valid())
        self.assertIn('items', s.errors)


class GroceryAPITest(APITestCase):
    """API endpoint tests for the Grocery module."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser', password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        self.cat = Category.objects.create(name='Fruits', order=1)
        self.product = Product.objects.create(
            name='Tomato', category=self.cat, unit='kg', sell_price='18.00'
        )

    def test_list_categories(self):
        r = self.client.get('/api/grocery/categories/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)

    def test_list_products(self):
        r = self.client.get('/api/grocery/products/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]['name'], 'Tomato')

    def test_list_products_includes_inactive_with_param(self):
        self.product.is_active = False
        self.product.save()
        r_default = self.client.get('/api/grocery/products/')
        self.assertEqual(len(r_default.data), 0)
        r_all = self.client.get('/api/grocery/products/?active=false')
        self.assertEqual(len(r_all.data), 1)

    def test_create_sale_record(self):
        payload = {
            'date': '2026-04-01',
            'notes': '',
            'items': [
                {'product': self.product.pk, 'quantity': '2.500', 'sell_price': '18.00'}
            ],
        }
        r = self.client.post(
            '/api/grocery/sale-records/',
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(SaleRecord.objects.count(), 1)
        self.assertEqual(SaleItem.objects.count(), 1)

    def test_create_sale_record_empty_items_rejected(self):
        payload = {'date': '2026-04-01', 'notes': '', 'items': []}
        r = self.client.post(
            '/api/grocery/sale-records/',
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(SaleRecord.objects.count(), 0)

    def test_create_stock_entry(self):
        payload = {
            'date': '2026-04-01',
            'notes': '',
            'items': [
                {'product': self.product.pk, 'quantity': '10.000', 'purchase_price': '12.00'}
            ],
        }
        r = self.client.post(
            '/api/grocery/stock-entries/',
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(StockEntry.objects.count(), 1)

    def test_create_stock_entry_empty_items_rejected(self):
        payload = {'date': '2026-04-01', 'notes': '', 'items': []}
        r = self.client.post(
            '/api/grocery/stock-entries/',
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(StockEntry.objects.count(), 0)

    def test_dashboard_today(self):
        sale = SaleRecord.objects.create(date='2026-04-01')
        SaleItem.objects.create(
            sale=sale, product=self.product, quantity='2.00', sell_price='18.00'
        )
        r = self.client.get('/api/grocery/dashboard/?range=today&date=2026-04-01')
        self.assertEqual(r.status_code, 200)
        self.assertIn('total_sales', r.data)

    def test_dashboard_profit_calculation(self):
        """Profit = (sell_price - purchase_price) × quantity, not sales - stock_cost."""
        entry = StockEntry.objects.create(date='2026-04-01')
        StockEntryItem.objects.create(
            entry=entry, product=self.product, quantity='20.00', purchase_price='12.00'
        )
        # Sell 5kg at ₺18. Purchase price was ₺12. Profit = (18-12)*5 = ₺30.
        sale = SaleRecord.objects.create(date='2026-04-01')
        SaleItem.objects.create(
            sale=sale, product=self.product, quantity='5.00', sell_price='18.00'
        )
        r = self.client.get('/api/grocery/dashboard/?range=today&date=2026-04-01')
        self.assertEqual(r.status_code, 200)
        self.assertAlmostEqual(float(r.data['total_sales']), 90.0, places=2)
        self.assertAlmostEqual(float(r.data['net_profit']), 30.0, places=2)

    def test_unauthenticated_access_rejected(self):
        self.client.logout()
        self.client.force_authenticate(user=None)
        r = self.client.get('/api/grocery/products/')
        self.assertIn(r.status_code, [401, 403])
