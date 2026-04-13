# backend/grocery/signals.py
"""Signals for the Grocery app."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from grocery.models import Category, Product, StoreProfile

User = get_user_model()

DEFAULT_CATEGORIES = [
    {'name': 'Sebze', 'order': 1},
    {'name': 'Meyve', 'order': 2},
    {'name': 'Diğer', 'order': 3},
]

DEFAULT_PRODUCTS = [
    {'name': 'Domates',       'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '5'},
    {'name': 'Salatalık',     'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '3'},
    {'name': 'Kırmızı Biber', 'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '3'},
    {'name': 'Patlıcan',      'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Patates',       'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '10'},
    {'name': 'Soğan',         'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '5'},
    {'name': 'Havuç',         'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '3'},
    {'name': 'Ispanak',       'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Marul',         'category': 'Sebze',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Elma',          'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '5'},
    {'name': 'Portakal',      'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '5'},
    {'name': 'Muz',           'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '3'},
    {'name': 'Limon',         'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Üzüm',          'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Kivi',          'category': 'Meyve',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Ceviz',         'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '1'},
    {'name': 'Nohut',         'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Mercimek',      'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '2'},
    {'name': 'Ay Çekirdeği',  'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '1'},
    {'name': 'Kuru İncir',    'category': 'Diğer',  'unit': 'kg', 'low_stock_threshold': '1'},
]


def seed_defaults(user):
    """Create default categories and products for a user. Idempotent — skips existing."""
    cat_map = {}
    for cat_data in DEFAULT_CATEGORIES:
        cat, _ = Category.objects.get_or_create(
            owner=user,
            name=cat_data['name'],
            defaults={'order': cat_data['order']},
        )
        cat_map[cat.name] = cat

    for p in DEFAULT_PRODUCTS:
        Product.objects.get_or_create(
            owner=user,
            name=p['name'],
            defaults={
                'category': cat_map.get(p['category']),
                'unit': p['unit'],
                'sell_price': Decimal('0'),
                'low_stock_threshold': Decimal(p['low_stock_threshold']),
            },
        )


@receiver(post_save, sender=User)
def on_user_created(sender, instance, created, **kwargs):
    """Create store profile for new users. Products/categories start blank."""
    if created:
        StoreProfile.objects.get_or_create(owner=instance)
