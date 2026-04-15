# src/backend/InvenTree/grocery/tests.py
"""Tests for the Grocery module."""

import json
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings

from rest_framework import status as drf_status
from rest_framework.test import APITestCase

from grocery.models import Category, Debt, DebtPayment, FinanceEntry, Product, SaleItem, SaleRecord, StockEntry, StockEntryItem, StoreProfile
from grocery.serializers import (
    CategorySerializer,
    ProductSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
)


class ProductCategoryOwnershipTest(APITestCase):
    """Ensure a product cannot be assigned to another user's category."""

    def setUp(self):
        self.user_a = User.objects.create_user(username='user_a', password='pass')
        self.user_b = User.objects.create_user(username='user_b', password='pass')
        self.cat_b = Category.objects.create(name='B-Fruits', order=1, owner=self.user_b)

    def test_cannot_assign_other_users_category(self):
        self.client.force_login(self.user_a)
        resp = self.client.post('/api/grocery/products/', {
            'name': 'Tomato',
            'unit': 'kg',
            'sell_price': '10.00',
            'category': self.cat_b.pk,
        }, content_type='application/json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('category', resp.json())

    def test_cannot_reassign_to_other_users_category_on_update(self):
        product = Product.objects.create(
            name='Tomato', unit='kg', sell_price='10.00', owner=self.user_a
        )
        self.client.force_login(self.user_a)
        resp = self.client.patch(
            f'/api/grocery/products/{product.pk}/',
            {'category': self.cat_b.pk},
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('category', resp.json())


class CategoryModelTest(TestCase):
    """Tests for the Category model."""

    def test_create_category(self):
        from django.contrib.auth.models import User
        user = User.objects.create_user(username='u1', password='p')
        cat = Category.objects.create(name='Vegetables', order=1, owner=user)
        self.assertEqual(str(cat), 'Vegetables')
        self.assertEqual(cat.order, 1)


class ProductModelTest(TestCase):
    """Tests for the Product model."""

    def setUp(self):
        from django.contrib.auth.models import User
        self.user = User.objects.create_user(username='u1', password='p')
        self.cat = Category.objects.create(name='Fruits', order=1, owner=self.user)

    def test_create_product(self):
        p = Product.objects.create(
            name='Tomato',
            category=self.cat,
            unit='kg',
            sell_price='18.00',
            low_stock_threshold='5.00',
            owner=self.user,
        )
        self.assertEqual(str(p), 'Tomato')
        self.assertEqual(p.unit, 'kg')
        self.assertTrue(p.is_active)

    def test_stock_level_starts_at_zero(self):
        p = Product.objects.create(
            name='Cucumber', category=self.cat, unit='kg', sell_price='12.00', owner=self.user,
        )
        self.assertEqual(p.stock_level, 0)

    def test_stock_level_after_entry(self):
        p = Product.objects.create(
            name='Lemon', category=self.cat, unit='kg', sell_price='25.00', owner=self.user,
        )
        entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
        StockEntryItem.objects.create(
            entry=entry, product=p, quantity='10.00', purchase_price='15.00'
        )
        self.assertEqual(p.stock_level, 10)

    def test_stock_level_after_sale(self):
        p = Product.objects.create(
            name='Banana', category=self.cat, unit='kg', sell_price='22.00', owner=self.user,
        )
        entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
        StockEntryItem.objects.create(
            entry=entry, product=p, quantity='20.00', purchase_price='14.00'
        )
        sale = SaleRecord.objects.create(date='2026-04-01', owner=self.user)
        SaleItem.objects.create(
            sale=sale, product=p, quantity='3.00', sell_price='22.00'
        )
        self.assertEqual(p.stock_level, 17)

    def test_most_recent_purchase_price(self):
        p = Product.objects.create(
            name='Onion', category=self.cat, unit='kg', sell_price='8.00', owner=self.user,
        )
        entry1 = StockEntry.objects.create(date='2026-03-25', owner=self.user)
        StockEntryItem.objects.create(
            entry=entry1, product=p, quantity='10.00', purchase_price='5.00'
        )
        entry2 = StockEntry.objects.create(date='2026-04-01', owner=self.user)
        StockEntryItem.objects.create(
            entry=entry2, product=p, quantity='10.00', purchase_price='6.00'
        )
        self.assertEqual(p.most_recent_purchase_price, 6)


class SerializerTest(TestCase):
    """Tests for Grocery serializers."""

    def setUp(self):
        from django.contrib.auth.models import User
        self.user = User.objects.create_user(username='u2', password='p')
        self.cat = Category.objects.create(name='Vegetables', order=1, owner=self.user)
        self.product = Product.objects.create(
            name='Tomato', category=self.cat, unit='kg', sell_price='18.00', owner=self.user,
        )

    def test_category_serializer(self):
        s = CategorySerializer(self.cat)
        self.assertEqual(s.data['name'], 'Vegetables')

    def test_product_serializer_includes_stock_level(self):
        s = ProductSerializer(self.product)
        self.assertIn('stock_level', s.data)
        self.assertEqual(float(s.data['stock_level']), 0)

    def test_stock_entry_serializer_nested(self):
        entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
        StockEntryItem.objects.create(
            entry=entry, product=self.product, quantity='10.00', purchase_price='12.00'
        )
        s = StockEntrySerializer(entry)
        self.assertEqual(len(s.data['items']), 1)
        self.assertEqual(s.data['items'][0]['product'], self.product.pk)

    def test_sale_record_serializer_nested(self):
        sale = SaleRecord.objects.create(date='2026-04-01', owner=self.user)
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
        # Remove auto-seeded defaults so counts are predictable in tests.
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.cat = Category.objects.create(name='Fruits', order=1, owner=self.user)
        self.product = Product.objects.create(
            name='Tomato', category=self.cat, unit='kg', sell_price='18.00', owner=self.user,
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
        # Add stock first so the stock validation passes.
        entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
        StockEntryItem.objects.create(
            entry=entry, product=self.product, quantity='10.000', purchase_price='12.00'
        )
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
        sale = SaleRecord.objects.create(date='2026-04-01', owner=self.user)
        SaleItem.objects.create(
            sale=sale, product=self.product, quantity='2.00', sell_price='18.00'
        )
        r = self.client.get('/api/grocery/dashboard/?range=today&date=2026-04-01')
        self.assertEqual(r.status_code, 200)
        self.assertIn('total_sales', r.data)

    def test_dashboard_profit_calculation(self):
        """Profit = (sell_price - purchase_price) × quantity, not sales - stock_cost."""
        entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
        StockEntryItem.objects.create(
            entry=entry, product=self.product, quantity='20.00', purchase_price='12.00'
        )
        # Sell 5kg at ₺18. Purchase price was ₺12. Profit = (18-12)*5 = ₺30.
        sale = SaleRecord.objects.create(date='2026-04-01', owner=self.user)
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

    def test_sale_record_items_include_product_name(self):
        entry = StockEntry.objects.create(date='2026-04-01', owner=self.user)
        StockEntryItem.objects.create(
            entry=entry, product=self.product, quantity='10.000', purchase_price='12.00'
        )
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
        r2 = self.client.get('/api/grocery/sale-records/')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data[0]['items'][0]['product_name'], 'Tomato')


class FetchMarketPricesTest(TestCase):
    """Tests for the fetch_market_prices pure function."""

    def _mock_response(self, data: dict, status_code: int = 200):
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_resp.json.return_value = data
        mock_resp.raise_for_status.return_value = None
        if status_code >= 400:
            from requests.exceptions import HTTPError
            mock_resp.raise_for_status.side_effect = HTTPError()
        return mock_resp

    def _make_content_item(self, id: str, title: str, brand: str, image_url=None, depots=None):
        if depots is None:
            depots = []
        return {
            "id": id,
            "title": title,
            "brand": brand,
            "imageUrl": image_url,
            "refinedQuantityUnit": None,
            "refinedVolumeOrWeight": None,
            "categories": [],
            "productDepotInfoList": depots,
        }

    def _make_depot(self, market: str, price: float, unit_price: str):
        return {
            "depotId": "1",
            "depotName": market,
            "price": price,
            "unitPrice": unit_price,
            "marketAdi": market,
            "percentage": 0.0,
            "longitude": 0.0,
            "latitude": 0.0,
            "indexTime": "2026-04-05T00:00:00",
        }

    @patch('grocery.market_prices.requests.post')
    def test_returns_parsed_results(self, mock_post):
        depots = [
            self._make_depot('BIM', 25.0, '25,00 TL/kg'),
            self._make_depot('A101', 22.0, '22,00 TL/kg'),
            self._make_depot('SOK', 30.0, '30,00 TL/kg'),
        ]
        item = self._make_content_item('abc', 'Domates', 'BrandX', depots=depots)
        mock_post.return_value = self._mock_response({
            'numberOfFound': 1,
            'searchResultType': 1,
            'content': [item],
        })

        from grocery.market_prices import fetch_market_prices
        results = fetch_market_prices('domates')

        self.assertEqual(len(results), 1)
        r = results[0]
        self.assertEqual(r['id'], 'abc')
        self.assertEqual(r['title'], 'Domates')
        self.assertEqual(r['brand'], 'BrandX')
        self.assertIsNone(r['imageUrl'])
        # sorted ascending by price: A101=22, BIM=25, SOK=30
        self.assertEqual(r['cheapest_stores'][0]['market'], 'A101')
        self.assertAlmostEqual(r['cheapest_stores'][0]['price'], 22.0)
        self.assertEqual(r['cheapest_stores'][0]['unitPrice'], '22,00 TL/kg')

    @patch('grocery.market_prices.requests.post')
    def test_returns_at_most_5_stores(self, mock_post):
        depots = [
            self._make_depot(f'Market{i}', float(10 + i), f'{10+i} TL')
            for i in range(8)
        ]
        item = self._make_content_item('x', 'X', 'Y', depots=depots)
        mock_post.return_value = self._mock_response({
            'numberOfFound': 1, 'searchResultType': 1, 'content': [item],
        })

        from grocery.market_prices import fetch_market_prices
        results = fetch_market_prices('x')
        self.assertLessEqual(len(results[0]['cheapest_stores']), 5)

    @patch('grocery.market_prices.requests.post')
    def test_returns_empty_on_network_error(self, mock_post):
        import requests as req_lib
        mock_post.side_effect = req_lib.exceptions.ConnectionError('fail')

        from grocery.market_prices import fetch_market_prices
        self.assertEqual(fetch_market_prices('anything'), [])

    @patch('grocery.market_prices.requests.post')
    def test_returns_empty_on_http_error(self, mock_post):
        mock_post.return_value = self._mock_response({}, status_code=500)

        from grocery.market_prices import fetch_market_prices
        self.assertEqual(fetch_market_prices('anything'), [])

    @patch('grocery.market_prices.requests.post')
    def test_posts_to_correct_url_with_headers(self, mock_post):
        mock_post.return_value = self._mock_response({
            'numberOfFound': 0, 'searchResultType': 0, 'content': [],
        })

        from grocery.market_prices import fetch_market_prices
        fetch_market_prices('elma')

        call_kwargs = mock_post.call_args
        self.assertIn('https://api.marketfiyati.org.tr/api/v2/search', call_kwargs[0])
        headers = call_kwargs[1]['headers']
        self.assertIn('Mozilla', headers['user-agent'])


class MarketPriceSearchViewTest(APITestCase):
    """Tests for the market_price_search Django view."""

    def setUp(self):
        self.user = User.objects.create_user(username='mpuser', password='pass')
        self.client.force_authenticate(user=self.user)
        # Clear any cached values between tests
        from django.core.cache import cache as django_cache
        django_cache.clear()

    @patch('grocery.market_prices.fetch_market_prices')
    def test_returns_200_with_results(self, mock_fetch):
        mock_fetch.return_value = [
            {'id': '1', 'title': 'Domates', 'brand': 'X', 'imageUrl': None,
             'cheapest_stores': [{'market': 'BIM', 'price': 20.0, 'unitPrice': '20 TL'}]}
        ]
        response = self.client.get('/api/market-prices/search/?q=domates')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('results', data)
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['title'], 'Domates')

    def test_returns_400_when_q_missing(self):
        response = self.client.get('/api/market-prices/search/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('error', response.json())

    def test_returns_401_when_unauthenticated(self):
        self.client.force_authenticate(user=None)
        response = self.client.get('/api/market-prices/search/?q=domates')
        # DRF returns 403 for session-based auth when unauthenticated (no WWW-Authenticate challenge)
        self.assertIn(response.status_code, (401, 403))

    @patch('grocery.market_prices.fetch_market_prices')
    def test_caches_result_on_second_call(self, mock_fetch):
        mock_fetch.return_value = [
            {'id': '1', 'title': 'Elma', 'brand': 'Y', 'imageUrl': None,
             'cheapest_stores': []}
        ]
        self.client.get('/api/market-prices/search/?q=elma')
        self.client.get('/api/market-prices/search/?q=elma')
        # fetch_market_prices should only be called once — second hit is cached
        mock_fetch.assert_called_once()

    @patch('grocery.market_prices.fetch_market_prices')
    def test_empty_result_is_cached(self, mock_fetch):
        mock_fetch.return_value = []
        self.client.get('/api/market-prices/search/?q=unknown')
        self.client.get('/api/market-prices/search/?q=unknown')
        mock_fetch.assert_called_once()


class StoreProfileTest(TestCase):
    """Tests for StoreProfile model and auto-creation."""

    def test_profile_auto_created_with_user(self):
        user = User.objects.create_user(username='profiletest', password='pass')
        self.assertTrue(StoreProfile.objects.filter(owner=user).exists())

    def test_profile_defaults_to_istanbul(self):
        user = User.objects.create_user(username='istanbul', password='pass')
        profile = StoreProfile.objects.get(owner=user)
        self.assertAlmostEqual(profile.latitude, 41.0082, places=3)
        self.assertAlmostEqual(profile.longitude, 28.9784, places=3)
        self.assertEqual(profile.search_radius_km, 5)

    def test_profile_str(self):
        user = User.objects.create_user(username='strtest', password='pass')
        profile = StoreProfile.objects.get(owner=user)
        self.assertIn('strtest', str(profile))


class ProfileAPITest(APITestCase):
    """Tests for GET/PATCH /api/grocery/profile/."""

    def setUp(self):
        self.user = User.objects.create_user(username='profapi', password='pass')
        self.client.force_authenticate(user=self.user)

    def test_get_profile_returns_defaults(self):
        response = self.client.get('/api/grocery/profile/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertAlmostEqual(data['latitude'], 41.0082, places=3)
        self.assertAlmostEqual(data['longitude'], 28.9784, places=3)
        self.assertEqual(data['search_radius_km'], 5)

    def test_patch_profile_updates_location(self):
        response = self.client.patch('/api/grocery/profile/', {
            'latitude': 38.4189,
            'longitude': 27.1287,
            'search_radius_km': 10,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertAlmostEqual(data['latitude'], 38.4189, places=3)
        self.assertAlmostEqual(data['longitude'], 27.1287, places=3)
        self.assertEqual(data['search_radius_km'], 10)

    def test_patch_profile_persists(self):
        self.client.patch('/api/grocery/profile/', {
            'latitude': 39.9179,
            'longitude': 32.8614,
            'search_radius_km': 5,
        }, format='json')
        response = self.client.get('/api/grocery/profile/')
        self.assertAlmostEqual(response.json()['latitude'], 39.9179, places=3)

    def test_unauthenticated_returns_401(self):
        self.client.logout()
        response = self.client.get('/api/grocery/profile/')
        self.assertIn(response.status_code, (401, 403))

    def test_users_cannot_access_each_others_profiles(self):
        other = User.objects.create_user(username='other_prof', password='pass')
        StoreProfile.objects.filter(owner=other).update(latitude=99.0)
        response = self.client.get('/api/grocery/profile/')
        self.assertNotAlmostEqual(response.json()['latitude'], 99.0, places=1)


class MarketPriceLocationTest(APITestCase):
    """Tests that market price searches use the user's profile location."""

    def setUp(self):
        self.user = User.objects.create_user(username='loctest', password='pass')
        self.client.force_authenticate(user=self.user)
        from django.core.cache import cache as django_cache
        django_cache.clear()

    @patch('grocery.market_prices.fetch_market_prices')
    def test_uses_profile_location(self, mock_fetch):
        mock_fetch.return_value = []
        StoreProfile.objects.filter(owner=self.user).update(
            latitude=38.42, longitude=27.13, search_radius_km=7
        )
        self.client.get('/api/market-prices/search/?q=elma')
        mock_fetch.assert_called_once_with('elma', 38.42, 27.13, 7)

    @patch('grocery.market_prices.fetch_market_prices')
    def test_different_locations_use_different_cache_keys(self, mock_fetch):
        mock_fetch.return_value = [{'id': '1', 'title': 'Elma', 'brand': '', 'imageUrl': None, 'cheapest_stores': []}]

        # User A at default location
        self.client.get('/api/market-prices/search/?q=elma')

        # User B at different location
        user_b = User.objects.create_user(username='loctest_b', password='pass')
        StoreProfile.objects.filter(owner=user_b).update(latitude=39.91, longitude=32.86)
        self.client.force_authenticate(user=user_b)
        self.client.get('/api/market-prices/search/?q=elma')

        # fetch should have been called twice — cache keys differ
        self.assertEqual(mock_fetch.call_count, 2)


class FinanceAPITest(APITestCase):
    """Tests for FinanceEntry CRUD and recurring logic."""

    def setUp(self):
        self.user = User.objects.create_user(username='finuser', password='pass')
        self.client.force_authenticate(user=self.user)
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()

    def test_create_expense_entry(self):
        r = self.client.post('/api/grocery/finance/', {
            'category': 'Kira', 'entry_type': 'expense',
            'amount': '5000.00', 'date': '2026-04-01',
            'is_recurring': False, 'notes': '',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(FinanceEntry.objects.filter(owner=self.user).count(), 1)

    def test_create_income_entry(self):
        r = self.client.post('/api/grocery/finance/', {
            'category': 'Bonus', 'entry_type': 'income',
            'amount': '500.00', 'date': '2026-04-05',
            'is_recurring': False, 'notes': '',
        }, format='json')
        self.assertEqual(r.status_code, 201)

    def test_list_entries_filtered_by_month(self):
        FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='5000.00', date='2026-04-01', is_recurring=False,
        )
        FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='5000.00', date='2026-03-01', is_recurring=False,
        )
        r = self.client.get('/api/grocery/finance/?month=2026-04')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['date'], '2026-04-01')

    def test_delete_entry(self):
        entry = FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='5000.00', date='2026-04-01', is_recurring=False,
        )
        r = self.client.delete(f'/api/grocery/finance/{entry.pk}/')
        self.assertEqual(r.status_code, 204)
        self.assertEqual(FinanceEntry.objects.filter(owner=self.user).count(), 0)

    def test_ownership_isolation(self):
        other = User.objects.create_user(username='other_fin', password='p')
        FinanceEntry.objects.create(
            owner=other, category='Kira', entry_type='expense',
            amount='3000.00', date='2026-04-01', is_recurring=False,
        )
        r = self.client.get('/api/grocery/finance/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 0)

    def test_recurring_entry_auto_created_for_current_month(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        FinanceEntry.objects.create(
            owner=self.user, category='Elektrik', entry_type='expense',
            amount='400.00', date='2026-03-01', is_recurring=True,
        )
        istanbul = ZoneInfo('Europe/Istanbul')
        today = datetime.now(istanbul).date()
        r = self.client.get('/api/grocery/finance/')
        self.assertEqual(r.status_code, 200)
        current = FinanceEntry.objects.filter(
            owner=self.user, category='Elektrik', is_recurring=True,
            date__year=today.year, date__month=today.month,
        )
        self.assertTrue(current.exists())

    def test_recurring_not_duplicated_on_multiple_gets(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        istanbul = ZoneInfo('Europe/Istanbul')
        today = datetime.now(istanbul).date()
        FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='5000.00', date='2026-03-01', is_recurring=True,
        )
        self.client.get('/api/grocery/finance/')
        self.client.get('/api/grocery/finance/')
        count = FinanceEntry.objects.filter(
            owner=self.user, category='Kira', is_recurring=True,
            date__year=today.year, date__month=today.month,
        ).count()
        self.assertEqual(count, 1)


class DebtAPITest(APITestCase):
    """Tests for Debt CRUD and remaining_amount annotation."""

    def setUp(self):
        self.user = User.objects.create_user(username='debtuser', password='pass')
        self.client.force_authenticate(user=self.user)
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()

    def test_create_debt(self):
        r = self.client.post('/api/grocery/debts/', {
            'name': 'Banka Kredisi', 'total_amount': '50000.00',
            'monthly_payment': '2000.00', 'start_date': '2026-01-01', 'notes': '',
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Debt.objects.filter(owner=self.user).count(), 1)

    def test_remaining_amount_equals_total_with_no_payments(self):
        Debt.objects.create(
            owner=self.user, name='Test', total_amount='10000.00',
            monthly_payment='500.00', start_date='2026-01-01',
        )
        r = self.client.get('/api/grocery/debts/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(float(r.data[0]['remaining_amount']), 10000.00)

    def test_remaining_amount_decreases_with_payments(self):
        debt = Debt.objects.create(
            owner=self.user, name='Test', total_amount='10000.00',
            monthly_payment='500.00', start_date='2026-01-01',
        )
        DebtPayment.objects.create(debt=debt, amount='2000.00', date='2026-02-01')
        r = self.client.get('/api/grocery/debts/')
        self.assertEqual(float(r.data[0]['remaining_amount']), 8000.00)

    def test_inactive_debts_excluded_by_default(self):
        Debt.objects.create(
            owner=self.user, name='Paid', total_amount='5000.00',
            monthly_payment='500.00', start_date='2026-01-01', is_active=False,
        )
        r = self.client.get('/api/grocery/debts/')
        self.assertEqual(len(r.data), 0)

    def test_inactive_debts_included_with_param(self):
        Debt.objects.create(
            owner=self.user, name='Paid', total_amount='5000.00',
            monthly_payment='500.00', start_date='2026-01-01', is_active=False,
        )
        r = self.client.get('/api/grocery/debts/?include_inactive=true')
        self.assertEqual(len(r.data), 1)

    def test_ownership_isolation(self):
        other = User.objects.create_user(username='other_debt', password='p')
        Debt.objects.create(
            owner=other, name='Other debt', total_amount='1000.00',
            monthly_payment='100.00', start_date='2026-01-01',
        )
        r = self.client.get('/api/grocery/debts/')
        self.assertEqual(len(r.data), 0)

    def test_patch_is_active_false(self):
        debt = Debt.objects.create(
            owner=self.user, name='Test', total_amount='5000.00',
            monthly_payment='500.00', start_date='2026-01-01',
        )
        r = self.client.patch(f'/api/grocery/debts/{debt.pk}/', {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 200)
        debt.refresh_from_db()
        self.assertFalse(debt.is_active)


class DebtPaymentAPITest(APITestCase):
    """Tests for DebtPayment creation, listing, and overpayment guard."""

    def setUp(self):
        self.user = User.objects.create_user(username='payuser', password='pass')
        self.client.force_authenticate(user=self.user)
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.debt = Debt.objects.create(
            owner=self.user, name='Kredisi', total_amount='10000.00',
            monthly_payment='1000.00', start_date='2026-01-01',
        )

    def test_create_payment(self):
        r = self.client.post(
            f'/api/grocery/debts/{self.debt.pk}/payments/',
            {'amount': '1000.00', 'date': '2026-04-01', 'notes': ''},
            format='json',
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(DebtPayment.objects.filter(debt=self.debt).count(), 1)

    def test_list_payments(self):
        DebtPayment.objects.create(debt=self.debt, amount='1000.00', date='2026-02-01')
        DebtPayment.objects.create(debt=self.debt, amount='1000.00', date='2026-03-01')
        r = self.client.get(f'/api/grocery/debts/{self.debt.pk}/payments/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 2)

    def test_overpayment_rejected(self):
        DebtPayment.objects.create(debt=self.debt, amount='9500.00', date='2026-02-01')
        r = self.client.post(
            f'/api/grocery/debts/{self.debt.pk}/payments/',
            {'amount': '1000.00', 'date': '2026-04-01', 'notes': ''},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('amount', r.data)

    def test_other_user_cannot_access_payments(self):
        other = User.objects.create_user(username='other_pay', password='p')
        self.client.force_authenticate(user=other)
        r = self.client.get(f'/api/grocery/debts/{self.debt.pk}/payments/')
        self.assertEqual(r.status_code, 404)

    def test_delete_payment(self):
        payment = DebtPayment.objects.create(debt=self.debt, amount='1000.00', date='2026-02-01')
        r = self.client.delete(f'/api/grocery/debts/{self.debt.pk}/payments/{payment.pk}/')
        self.assertEqual(r.status_code, 204)
        self.assertEqual(DebtPayment.objects.filter(debt=self.debt).count(), 0)

    def test_other_user_cannot_delete_payment(self):
        payment = DebtPayment.objects.create(debt=self.debt, amount='1000.00', date='2026-02-01')
        other = User.objects.create_user(username='other_del', password='p')
        self.client.force_authenticate(user=other)
        r = self.client.delete(f'/api/grocery/debts/{self.debt.pk}/payments/{payment.pk}/')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(DebtPayment.objects.filter(debt=self.debt).count(), 1)


class DashboardFinanceTest(APITestCase):
    """Tests for monthly_expenses, monthly_income_extra, total_debt_remaining in dashboard."""

    def setUp(self):
        self.user = User.objects.create_user(username='dashfin', password='pass')
        self.client.force_authenticate(user=self.user)
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()

    def test_dashboard_includes_finance_fields_when_empty(self):
        r = self.client.get('/api/grocery/dashboard/?range=today')
        self.assertEqual(r.status_code, 200)
        self.assertIn('monthly_expenses', r.data)
        self.assertIn('monthly_income_extra', r.data)
        self.assertIn('total_debt_remaining', r.data)
        self.assertEqual(float(r.data['monthly_expenses']), 0.0)
        self.assertEqual(float(r.data['total_debt_remaining']), 0.0)

    def test_dashboard_monthly_expenses_sums_current_month(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        istanbul = ZoneInfo('Europe/Istanbul')
        today = datetime.now(istanbul).date()
        FinanceEntry.objects.create(
            owner=self.user, category='Kira', entry_type='expense',
            amount='3000.00', date=today, is_recurring=False,
        )
        FinanceEntry.objects.create(
            owner=self.user, category='Elektrik', entry_type='expense',
            amount='500.00', date=today, is_recurring=False,
        )
        r = self.client.get('/api/grocery/dashboard/?range=today')
        self.assertEqual(float(r.data['monthly_expenses']), 3500.0)

    def test_dashboard_total_debt_remaining_correct(self):
        debt = Debt.objects.create(
            owner=self.user, name='Kredi', total_amount='20000.00',
            monthly_payment='1000.00', start_date='2026-01-01',
        )
        DebtPayment.objects.create(debt=debt, amount='5000.00', date='2026-02-01')
        r = self.client.get('/api/grocery/dashboard/?range=today')
        self.assertEqual(float(r.data['total_debt_remaining']), 15000.0)


class LoginLockoutTest(APITestCase):
    """Tests for django-axes account lockout on excessive login failures."""

    def setUp(self):
        self.user = User.objects.create_user(username='locktest', password='correct-pass-123')
        from axes.models import AccessAttempt
        AccessAttempt.objects.all().delete()
        # Bypass DRF throttle so axes failure limit is reached before rate-limit kicks in
        self.throttle_patcher = patch('config.urls.LoginRateThrottle.allow_request', return_value=True)
        self.throttle_patcher.start()

    def tearDown(self):
        self.throttle_patcher.stop()
        from axes.models import AccessAttempt
        AccessAttempt.objects.all().delete()

    def test_correct_login_succeeds(self):
        r = self.client.post(
            '/api/auth/login/',
            {'username': 'locktest', 'password': 'correct-pass-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()['authenticated'])

    def test_wrong_password_returns_401(self):
        r = self.client.post(
            '/api/auth/login/',
            {'username': 'locktest', 'password': 'wrong'},
            format='json',
        )
        self.assertEqual(r.status_code, 401)
        self.assertIn('Geçersiz', r.json()['error'])

    def test_account_locked_after_10_failures(self):
        for _ in range(10):
            self.client.post(
                '/api/auth/login/',
                {'username': 'locktest', 'password': 'wrong'},
                format='json',
            )
        # 11th attempt with correct password — should be locked out (403)
        r = self.client.post(
            '/api/auth/login/',
            {'username': 'locktest', 'password': 'correct-pass-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_account_not_locked_before_limit(self):
        for _ in range(9):
            self.client.post(
                '/api/auth/login/',
                {'username': 'locktest', 'password': 'wrong'},
                format='json',
            )
        # 10th attempt with correct password — should still succeed
        r = self.client.post(
            '/api/auth/login/',
            {'username': 'locktest', 'password': 'correct-pass-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)

    def test_lockout_does_not_affect_other_users(self):
        User.objects.create_user(username='otheruser', password='other-pass-123')
        for _ in range(10):
            self.client.post(
                '/api/auth/login/',
                {'username': 'locktest', 'password': 'wrong'},
                format='json',
            )
        # Other user should still be able to log in
        r = self.client.post(
            '/api/auth/login/',
            {'username': 'otheruser', 'password': 'other-pass-123'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)


class WasteEntryModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='waste_u', password='p')
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.cat = Category.objects.create(name='Sebze', order=1, owner=self.user)
        self.product = Product.objects.create(
            name='Domates', category=self.cat, unit='kg', sell_price='18', owner=self.user
        )
        entry = StockEntry.objects.create(date='2026-04-14', owner=self.user)
        StockEntryItem.objects.create(entry=entry, product=self.product, quantity='10', purchase_price='12')

    def test_waste_reduces_stock(self):
        from grocery.models import WasteEntry, WasteItem
        we = WasteEntry.objects.create(date='2026-04-14', owner=self.user)
        WasteItem.objects.create(entry=we, product=self.product, quantity='3', reason='spoiled')
        self.assertEqual(self.product.stock_level, 7)  # 10 - 3


class ReturnRecordModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='return_u', password='p')
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.cat = Category.objects.create(name='Sebze', order=1, owner=self.user)
        self.product = Product.objects.create(
            name='Salatalık', category=self.cat, unit='kg', sell_price='15', owner=self.user
        )
        entry = StockEntry.objects.create(date='2026-04-14', owner=self.user)
        StockEntryItem.objects.create(entry=entry, product=self.product, quantity='10', purchase_price='10')
        sale = SaleRecord.objects.create(date='2026-04-14', owner=self.user)
        SaleItem.objects.create(sale=sale, product=self.product, quantity='5', sell_price='15')

    def test_return_increases_stock(self):
        from grocery.models import ReturnRecord, ReturnItem
        rr = ReturnRecord.objects.create(date='2026-04-14', owner=self.user)
        ReturnItem.objects.create(record=rr, product=self.product, quantity='2', refund_price='15')
        self.assertEqual(self.product.stock_level, 7)  # 10 - 5 + 2


class StockFormulaTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='formula_u', password='p')
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.cat = Category.objects.create(name='Sebze', order=1, owner=self.user)
        self.product = Product.objects.create(
            name='Biber', category=self.cat, unit='kg', sell_price='20', owner=self.user
        )
        # Stock in: 10 kg
        entry = StockEntry.objects.create(date='2026-04-14', owner=self.user)
        StockEntryItem.objects.create(entry=entry, product=self.product, quantity='10', purchase_price='12')
        # Sold: 3 kg
        sale = SaleRecord.objects.create(date='2026-04-14', owner=self.user)
        SaleItem.objects.create(sale=sale, product=self.product, quantity='3', sell_price='20')
        # Wasted: 1 kg
        from grocery.models import WasteEntry, WasteItem
        we = WasteEntry.objects.create(date='2026-04-14', owner=self.user)
        WasteItem.objects.create(entry=we, product=self.product, quantity='1', reason='spoiled')
        # Returned: 2 kg
        from grocery.models import ReturnRecord, ReturnItem
        rr = ReturnRecord.objects.create(date='2026-04-14', owner=self.user)
        ReturnItem.objects.create(record=rr, product=self.product, quantity='2', refund_price='20')
        self.client.force_authenticate(user=self.user)

    def test_annotated_stock_level(self):
        # expected: 10 + 2 - 3 - 1 = 8
        r = self.client.get('/api/grocery/products/')
        self.assertEqual(r.status_code, 200)
        product_data = next(p for p in r.data if p['name'] == 'Biber')
        self.assertEqual(float(product_data['stock_level']), 8.0)

    def test_sale_respects_wasted_stock(self):
        # 8 kg available; trying to sell 9 should fail
        r = self.client.post('/api/grocery/sale-records/', {
            'date': '2026-04-14',
            'notes': '',
            'items': [{'product': self.product.pk, 'quantity': '9', 'sell_price': '20'}],
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_sale_within_available_stock_succeeds(self):
        # 8 kg available; selling 8 should work
        r = self.client.post('/api/grocery/sale-records/', {
            'date': '2026-04-14',
            'notes': '',
            'items': [{'product': self.product.pk, 'quantity': '8', 'sell_price': '20'}],
        }, format='json')
        self.assertEqual(r.status_code, 201)


class WasteEntryAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='waste_api_u', password='p')
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.cat = Category.objects.create(name='Sebze', order=1, owner=self.user)
        self.product = Product.objects.create(
            name='Patlıcan', category=self.cat, unit='kg', sell_price='25', owner=self.user
        )
        entry = StockEntry.objects.create(date='2026-04-14', owner=self.user)
        StockEntryItem.objects.create(entry=entry, product=self.product, quantity='10', purchase_price='15')
        self.client.force_authenticate(user=self.user)

    def test_create_waste_entry(self):
        r = self.client.post('/api/grocery/waste-entries/', {
            'date': '2026-04-14',
            'notes': 'Hepsi bozuldu',
            'items': [{'product': self.product.pk, 'quantity': '3', 'reason': 'spoiled'}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(r.data['items']), 1)
        self.assertEqual(r.data['items'][0]['reason'], 'spoiled')

    def test_waste_entry_requires_at_least_one_item(self):
        r = self.client.post('/api/grocery/waste-entries/', {
            'date': '2026-04-14',
            'notes': '',
            'items': [],
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_waste_entry_rejects_other_users_product(self):
        other_user = User.objects.create_user(username='other_waste', password='p')
        other_product = Product.objects.create(
            name='Havuç', unit='kg', sell_price='10', owner=other_user
        )
        r = self.client.post('/api/grocery/waste-entries/', {
            'date': '2026-04-14',
            'notes': '',
            'items': [{'product': other_product.pk, 'quantity': '1', 'reason': 'spoiled'}],
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_list_waste_entries(self):
        from grocery.models import WasteEntry, WasteItem
        we = WasteEntry.objects.create(date='2026-04-14', owner=self.user)
        WasteItem.objects.create(entry=we, product=self.product, quantity='2', reason='damaged')
        r = self.client.get('/api/grocery/waste-entries/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)

    def test_waste_entries_isolated_by_owner(self):
        from grocery.models import WasteEntry, WasteItem
        other_user = User.objects.create_user(username='other_waste2', password='p')
        other_product = Product.objects.create(
            name='Marul', unit='kg', sell_price='8', owner=other_user
        )
        other_entry = StockEntry.objects.create(date='2026-04-14', owner=other_user)
        StockEntryItem.objects.create(entry=other_entry, product=other_product, quantity='5', purchase_price='5')
        we = WasteEntry.objects.create(date='2026-04-14', owner=other_user)
        WasteItem.objects.create(entry=we, product=other_product, quantity='1', reason='spoiled')
        r = self.client.get('/api/grocery/waste-entries/')
        self.assertEqual(len(r.data), 0)


class ReturnRecordAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='return_api_u', password='p')
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.cat = Category.objects.create(name='Meyve', order=1, owner=self.user)
        self.product = Product.objects.create(
            name='Elma', category=self.cat, unit='kg', sell_price='30', owner=self.user
        )
        entry = StockEntry.objects.create(date='2026-04-14', owner=self.user)
        StockEntryItem.objects.create(entry=entry, product=self.product, quantity='10', purchase_price='20')
        self.sale = SaleRecord.objects.create(date='2026-04-14', owner=self.user)
        SaleItem.objects.create(sale=self.sale, product=self.product, quantity='5', sell_price='30')
        self.client.force_authenticate(user=self.user)

    def test_create_return_record(self):
        r = self.client.post('/api/grocery/returns/', {
            'date': '2026-04-14',
            'original_sale': self.sale.pk,
            'notes': 'Müşteri iade etti',
            'items': [{'product': self.product.pk, 'quantity': '2', 'refund_price': '30.00'}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(r.data['items']), 1)

    def test_create_return_without_original_sale(self):
        r = self.client.post('/api/grocery/returns/', {
            'date': '2026-04-14',
            'notes': '',
            'items': [{'product': self.product.pk, 'quantity': '1', 'refund_price': '28.00'}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertIsNone(r.data['original_sale'])

    def test_return_requires_at_least_one_item(self):
        r = self.client.post('/api/grocery/returns/', {
            'date': '2026-04-14',
            'notes': '',
            'items': [],
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_return_increases_stock(self):
        self.client.post('/api/grocery/returns/', {
            'date': '2026-04-14',
            'notes': '',
            'items': [{'product': self.product.pk, 'quantity': '2', 'refund_price': '30'}],
        }, format='json')
        r = self.client.get('/api/grocery/products/')
        product_data = next(p for p in r.data if p['name'] == 'Elma')
        # 10 received - 5 sold + 2 returned = 7
        self.assertEqual(float(product_data['stock_level']), 7.0)

    def test_list_returns_isolated_by_owner(self):
        other_user = User.objects.create_user(username='other_return', password='p')
        other_product = Product.objects.create(name='Portakal', unit='kg', sell_price='20', owner=other_user)
        other_entry = StockEntry.objects.create(date='2026-04-14', owner=other_user)
        StockEntryItem.objects.create(entry=other_entry, product=other_product, quantity='5', purchase_price='15')
        from grocery.models import ReturnRecord, ReturnItem
        rr = ReturnRecord.objects.create(date='2026-04-14', owner=other_user)
        ReturnItem.objects.create(record=rr, product=other_product, quantity='1', refund_price='20')
        r = self.client.get('/api/grocery/returns/')
        self.assertEqual(len(r.data), 0)


class PaymentMethodTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='pay_u', password='p')
        Product.objects.filter(owner=self.user).delete()
        Category.objects.filter(owner=self.user).delete()
        self.cat = Category.objects.create(name='Sebze', order=1, owner=self.user)
        self.product = Product.objects.create(
            name='Soğan', category=self.cat, unit='kg', sell_price='12', owner=self.user
        )
        entry = StockEntry.objects.create(date='2026-04-14', owner=self.user)
        StockEntryItem.objects.create(entry=entry, product=self.product, quantity='20', purchase_price='8')
        self.client.force_authenticate(user=self.user)

    def test_sale_defaults_to_cash(self):
        r = self.client.post('/api/grocery/sale-records/', {
            'date': '2026-04-14',
            'notes': '',
            'items': [{'product': self.product.pk, 'quantity': '3', 'sell_price': '12'}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['payment_method'], 'cash')

    def test_sale_with_card(self):
        r = self.client.post('/api/grocery/sale-records/', {
            'date': '2026-04-14',
            'payment_method': 'card',
            'notes': '',
            'items': [{'product': self.product.pk, 'quantity': '2', 'sell_price': '12'}],
        }, format='json')
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data['payment_method'], 'card')

    def test_dashboard_cash_card_split(self):
        # Cash sale: 3 kg × ₺12 = ₺36
        self.client.post('/api/grocery/sale-records/', {
            'date': '2026-04-14', 'payment_method': 'cash', 'notes': '',
            'items': [{'product': self.product.pk, 'quantity': '3', 'sell_price': '12'}],
        }, format='json')
        # Card sale: 2 kg × ₺12 = ₺24
        self.client.post('/api/grocery/sale-records/', {
            'date': '2026-04-14', 'payment_method': 'card', 'notes': '',
            'items': [{'product': self.product.pk, 'quantity': '2', 'sell_price': '12'}],
        }, format='json')
        r = self.client.get('/api/grocery/dashboard/', {'range': 'today', 'date': '2026-04-14'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(float(r.data['cash_sales']), 36.0)
        self.assertEqual(float(r.data['card_sales']), 24.0)


class StoreProfileValidationTest(APITestCase):
    """Ensure lat/lon are validated."""

    def setUp(self):
        self.user = User.objects.create_user(username='prof_user', password='pass')
        self.client.force_login(self.user)

    def test_invalid_latitude_rejected(self):
        resp = self.client.patch('/api/grocery/profile/', {'latitude': 999.0}, content_type='application/json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('latitude', resp.json())

    def test_invalid_longitude_rejected(self):
        resp = self.client.patch('/api/grocery/profile/', {'longitude': -999.0}, content_type='application/json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('longitude', resp.json())

    def test_valid_coordinates_accepted(self):
        resp = self.client.patch('/api/grocery/profile/', {'latitude': 41.0, 'longitude': 28.9}, content_type='application/json')
        self.assertEqual(resp.status_code, 200)


class DebtDetailGetTest(APITestCase):
    """GET /api/grocery/debts/<pk>/ should return the debt."""

    def setUp(self):
        self.user = User.objects.create_user(username='debt_user', password='pass')
        self.client.force_login(self.user)
        self.debt = Debt.objects.create(
            owner=self.user,
            name='Test Borç',
            total_amount='1000.00',
            monthly_payment='100.00',
            start_date='2026-01-01',
        )

    def test_get_debt_detail(self):
        resp = self.client.get(f'/api/grocery/debts/{self.debt.pk}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['name'], 'Test Borç')

    def test_other_user_cannot_get_debt(self):
        other = User.objects.create_user(username='other_debt', password='pass')
        self.client.force_login(other)
        resp = self.client.get(f'/api/grocery/debts/{self.debt.pk}/')
        self.assertEqual(resp.status_code, 404)
