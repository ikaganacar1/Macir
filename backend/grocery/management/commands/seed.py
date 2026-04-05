"""
Management command: python manage.py seed

Populates the database with realistic Turkish grocery store demo data:
- 3 categories, 20 products
- 4 stock entry sessions over the past 2 weeks
- 7 daily sale records covering the past week
"""

from datetime import date, timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from grocery.models import Category, Product, SaleItem, SaleRecord, StockEntry, StockEntryItem


CATEGORIES = [
    {'name': 'Sebze', 'order': 1},
    {'name': 'Meyve', 'order': 2},
    {'name': 'Diğer', 'order': 3},
]

PRODUCTS = [
    # Sebze
    {'name': 'Domates',       'category': 'Sebze',  'unit': 'kg',    'sell_price': '18.00', 'low_stock_threshold': '5'},
    {'name': 'Salatalık',     'category': 'Sebze',  'unit': 'kg',    'sell_price': '14.00', 'low_stock_threshold': '3'},
    {'name': 'Kırmızı Biber', 'category': 'Sebze',  'unit': 'kg',    'sell_price': '22.00', 'low_stock_threshold': '3'},
    {'name': 'Patlıcan',      'category': 'Sebze',  'unit': 'kg',    'sell_price': '16.00', 'low_stock_threshold': '2'},
    {'name': 'Patates',       'category': 'Sebze',  'unit': 'kg',    'sell_price': '12.00', 'low_stock_threshold': '10'},
    {'name': 'Soğan',         'category': 'Sebze',  'unit': 'kg',    'sell_price': '10.00', 'low_stock_threshold': '5'},
    {'name': 'Havuç',         'category': 'Sebze',  'unit': 'kg',    'sell_price': '13.00', 'low_stock_threshold': '3'},
    {'name': 'Ispanak',       'category': 'Sebze',  'unit': 'kg',    'sell_price': '20.00', 'low_stock_threshold': '2'},
    {'name': 'Marul',         'category': 'Sebze',  'unit': 'kg',    'sell_price': '15.00', 'low_stock_threshold': '2'},
    # Meyve
    {'name': 'Elma',          'category': 'Meyve',  'unit': 'kg',    'sell_price': '24.00', 'low_stock_threshold': '5'},
    {'name': 'Portakal',      'category': 'Meyve',  'unit': 'kg',    'sell_price': '20.00', 'low_stock_threshold': '5'},
    {'name': 'Muz',           'category': 'Meyve',  'unit': 'kg',    'sell_price': '28.00', 'low_stock_threshold': '3'},
    {'name': 'Limon',         'category': 'Meyve',  'unit': 'kg',    'sell_price': '18.00', 'low_stock_threshold': '2'},
    {'name': 'Üzüm',          'category': 'Meyve',  'unit': 'kg',    'sell_price': '35.00', 'low_stock_threshold': '2'},
    {'name': 'Kivi',          'category': 'Meyve',  'unit': 'kg',    'sell_price': '40.00', 'low_stock_threshold': '2'},
    # Diğer
    {'name': 'Ceviz',         'category': 'Diğer',  'unit': 'kg',    'sell_price': '180.00','low_stock_threshold': '1'},
    {'name': 'Nohut',         'category': 'Diğer',  'unit': 'kg',    'sell_price': '45.00', 'low_stock_threshold': '2'},
    {'name': 'Mercimek',      'category': 'Diğer',  'unit': 'kg',    'sell_price': '38.00', 'low_stock_threshold': '2'},
    {'name': 'Ay Çekirdeği',  'category': 'Diğer',  'unit': 'kg',    'sell_price': '55.00', 'low_stock_threshold': '1'},
    {'name': 'Kuru İncir',    'category': 'Diğer',  'unit': 'kg',    'sell_price': '120.00','low_stock_threshold': '1'},
]

# Stock entries: (days_ago, [(product_name, qty, purchase_price), ...])
STOCK_ENTRIES = [
    (13, [
        ('Domates',       50, '10.00'),
        ('Salatalık',     30, '8.00'),
        ('Kırmızı Biber', 20, '13.00'),
        ('Patlıcan',      15, '9.00'),
        ('Patates',       80, '7.00'),
        ('Soğan',         60, '6.00'),
        ('Havuç',         25, '7.50'),
        ('Elma',          40, '14.00'),
        ('Portakal',      40, '12.00'),
        ('Muz',           25, '17.00'),
        ('Limon',         20, '10.00'),
        ('Ceviz',          5, '120.00'),
        ('Nohut',         15, '28.00'),
        ('Mercimek',      15, '24.00'),
    ]),
    (6, [
        ('Domates',       40, '11.00'),
        ('Salatalık',     25, '8.50'),
        ('Kırmızı Biber', 15, '14.00'),
        ('Ispanak',       10, '11.00'),
        ('Marul',         12, '9.00'),
        ('Elma',          30, '15.00'),
        ('Üzüm',          10, '22.00'),
        ('Kivi',           8, '26.00'),
        ('Ay Çekirdeği',   5, '35.00'),
        ('Kuru İncir',     3, '80.00'),
        ('Patates',       50, '7.50'),
        ('Soğan',         30, '6.50'),
    ]),
    (3, [
        ('Domates',       30, '11.50'),
        ('Salatalık',     20, '9.00'),
        ('Muz',           15, '18.00'),
        ('Portakal',      25, '13.00'),
        ('Limon',         10, '11.00'),
        ('Havuç',         20, '8.00'),
        ('Nohut',         10, '29.00'),
    ]),
    (0, [
        ('Domates',       20, '12.00'),
        ('Kırmızı Biber', 10, '15.00'),
        ('Elma',          20, '16.00'),
        ('Mercimek',       8, '25.00'),
    ]),
]

# Sales records: (days_ago, [(product_name, qty, sell_price), ...])
SALES = [
    (6, [
        ('Domates',       8.5,  '18.00'),
        ('Salatalık',     5.0,  '14.00'),
        ('Elma',          6.0,  '24.00'),
        ('Portakal',      5.0,  '20.00'),
        ('Patates',      10.0,  '12.00'),
        ('Soğan',         4.0,  '10.00'),
    ]),
    (5, [
        ('Domates',      12.0,  '18.00'),
        ('Salatalık',     7.5,  '14.00'),
        ('Kırmızı Biber', 3.0,  '22.00'),
        ('Muz',           4.0,  '28.00'),
        ('Elma',          5.0,  '24.00'),
        ('Nohut',         2.0,  '45.00'),
    ]),
    (4, [
        ('Domates',       9.0,  '18.00'),
        ('Patlıcan',      4.5,  '16.00'),
        ('Portakal',      6.0,  '20.00'),
        ('Limon',         2.5,  '18.00'),
        ('Patates',       8.0,  '12.00'),
        ('Havuç',         3.0,  '13.00'),
        ('Mercimek',      2.0,  '38.00'),
    ]),
    (3, [
        ('Domates',      15.0,  '18.00'),
        ('Salatalık',     8.0,  '14.00'),
        ('Kırmızı Biber', 4.0,  '22.00'),
        ('Ispanak',       3.0,  '20.00'),
        ('Marul',         2.5,  '15.00'),
        ('Elma',          7.0,  '24.00'),
        ('Üzüm',          2.0,  '35.00'),
        ('Ceviz',         0.5,  '180.00'),
    ]),
    (2, [
        ('Domates',      11.0,  '18.00'),
        ('Salatalık',     6.0,  '14.00'),
        ('Muz',           5.0,  '28.00'),
        ('Portakal',      4.0,  '20.00'),
        ('Kivi',          2.0,  '40.00'),
        ('Ay Çekirdeği',  1.5,  '55.00'),
        ('Kuru İncir',    0.5,  '120.00'),
        ('Soğan',         3.0,  '10.00'),
    ]),
    (1, [
        ('Domates',      13.0,  '18.00'),
        ('Salatalık',     9.0,  '14.00'),
        ('Kırmızı Biber', 3.5,  '22.00'),
        ('Patates',      12.0,  '12.00'),
        ('Elma',          8.0,  '24.00'),
        ('Nohut',         3.0,  '45.00'),
        ('Mercimek',      2.5,  '38.00'),
        ('Havuç',         4.0,  '13.00'),
    ]),
    (0, [
        ('Domates',       7.0,  '18.00'),
        ('Salatalık',     4.0,  '14.00'),
        ('Muz',           3.0,  '28.00'),
        ('Elma',          5.0,  '24.00'),
        ('Soğan',         2.0,  '10.00'),
        ('Limon',         1.5,  '18.00'),
    ]),
]


class Command(BaseCommand):
    help = 'Seed the database with demo grocery store data'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true', help='Clear existing data before seeding')

    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write('Clearing existing data...')
            SaleItem.objects.all().delete()
            SaleRecord.objects.all().delete()
            StockEntryItem.objects.all().delete()
            StockEntry.objects.all().delete()
            Product.objects.all().delete()
            Category.objects.all().delete()

        today = date.today()

        with transaction.atomic():
            # Categories
            self.stdout.write('Creating categories...')
            cat_map = {}
            for cat_data in CATEGORIES:
                cat, _ = Category.objects.get_or_create(name=cat_data['name'], defaults={'order': cat_data['order']})
                cat_map[cat.name] = cat

            # Products
            self.stdout.write('Creating products...')
            product_map = {}
            for p in PRODUCTS:
                product, _ = Product.objects.get_or_create(
                    name=p['name'],
                    defaults={
                        'category': cat_map[p['category']],
                        'unit': p['unit'],
                        'sell_price': Decimal(p['sell_price']),
                        'low_stock_threshold': Decimal(p['low_stock_threshold']),
                    }
                )
                product_map[product.name] = product

            # Stock entries
            self.stdout.write('Creating stock entries...')
            for days_ago, items in STOCK_ENTRIES:
                entry_date = today - timedelta(days=days_ago)
                entry = StockEntry.objects.create(date=entry_date)
                for name, qty, price in items:
                    if name in product_map:
                        StockEntryItem.objects.create(
                            entry=entry,
                            product=product_map[name],
                            quantity=Decimal(str(qty)),
                            purchase_price=Decimal(price),
                        )

            # Sales
            self.stdout.write('Creating sales records...')
            for days_ago, items in SALES:
                sale_date = today - timedelta(days=days_ago)
                sale = SaleRecord.objects.create(date=sale_date)
                for name, qty, price in items:
                    if name in product_map:
                        SaleItem.objects.create(
                            sale=sale,
                            product=product_map[name],
                            quantity=Decimal(str(qty)),
                            sell_price=Decimal(price),
                        )

        self.stdout.write(self.style.SUCCESS(
            f'Done! {len(CATEGORIES)} categories, {len(PRODUCTS)} products, '
            f'{len(STOCK_ENTRIES)} stock entries, {len(SALES)} sale records created.'
        ))
