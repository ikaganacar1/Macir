"""
Management command: python manage.py seed [--user <username>] [--clear]

Populates demo data for a user:
- Stock entry sessions over the past 2 weeks
- Daily sale records covering the past week

Categories and products are NOT created here — they are seeded by the
post_save signal (or seed_defaults command). This command only adds
stock and sales on top of whatever products exist for the user.

Usage:
    python manage.py seed                    # uses first superuser
    python manage.py seed --user umut
    python manage.py seed --user ika --clear # wipes ika's stock+sales first
"""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from grocery.models import Product, SaleItem, SaleRecord, StockEntry, StockEntryItem

User = get_user_model()

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
    help = 'Seed demo stock and sales data for a user'

    def add_arguments(self, parser):
        parser.add_argument('--user', default=None, help='Username to seed data for (default: first superuser)')
        parser.add_argument('--clear', action='store_true', help="Clear user's stock and sales before seeding")

    def handle(self, *args, **options):
        username = options['user']
        if username:
            try:
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                raise CommandError(f'User "{username}" does not exist')
        else:
            user = User.objects.filter(is_superuser=True).order_by('pk').first()
            if not user:
                raise CommandError('No superuser found. Pass --user <username>.')

        if options['clear']:
            self.stdout.write(f'Clearing stock and sales for "{user.username}"...')
            SaleItem.objects.filter(sale__owner=user).delete()
            SaleRecord.objects.filter(owner=user).delete()
            StockEntryItem.objects.filter(entry__owner=user).delete()
            StockEntry.objects.filter(owner=user).delete()

        today = date.today()
        product_map = {p.name: p for p in Product.objects.filter(owner=user)}

        if not product_map:
            self.stdout.write(self.style.WARNING(
                f'No products found for "{user.username}". '
                'Run seed_defaults first: python manage.py seed_defaults --user ' + user.username
            ))
            return

        with transaction.atomic():
            self.stdout.write('Creating stock entries...')
            for days_ago, items in STOCK_ENTRIES:
                entry_date = today - timedelta(days=days_ago)
                entry = StockEntry.objects.create(owner=user, date=entry_date)
                for name, qty, price in items:
                    if name in product_map:
                        StockEntryItem.objects.create(
                            entry=entry,
                            product=product_map[name],
                            quantity=Decimal(str(qty)),
                            purchase_price=Decimal(price),
                        )

            self.stdout.write('Creating sales records...')
            for days_ago, items in SALES:
                sale_date = today - timedelta(days=days_ago)
                sale = SaleRecord.objects.create(owner=user, date=sale_date)
                for name, qty, price in items:
                    if name in product_map:
                        SaleItem.objects.create(
                            sale=sale,
                            product=product_map[name],
                            quantity=Decimal(str(qty)),
                            sell_price=Decimal(price),
                        )

        self.stdout.write(self.style.SUCCESS(
            f'Done! {len(STOCK_ENTRIES)} stock entries, {len(SALES)} sale records '
            f'created for "{user.username}".'
        ))
