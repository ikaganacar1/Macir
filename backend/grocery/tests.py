# src/backend/InvenTree/grocery/tests.py
"""Tests for the Grocery module."""

import json
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.contrib.auth.models import User
from django.test import TestCase

from rest_framework import status as drf_status
from rest_framework.test import APITestCase

from grocery.models import Category, Product, SaleItem, SaleRecord, StockEntry, StockEntryItem, StoreProfile
from grocery.serializers import (
    CategorySerializer,
    ProductSerializer,
    SaleRecordSerializer,
    StockEntrySerializer,
)


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
        self.assertEqual(profile.search_radius_km, 50)

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
        self.assertEqual(data['search_radius_km'], 50)

    def test_patch_profile_updates_location(self):
        response = self.client.patch('/api/grocery/profile/', {
            'latitude': 38.4189,
            'longitude': 27.1287,
            'search_radius_km': 100,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertAlmostEqual(data['latitude'], 38.4189, places=3)
        self.assertAlmostEqual(data['longitude'], 27.1287, places=3)
        self.assertEqual(data['search_radius_km'], 100)

    def test_patch_profile_persists(self):
        self.client.patch('/api/grocery/profile/', {
            'latitude': 39.9179,
            'longitude': 32.8614,
            'search_radius_km': 25,
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
