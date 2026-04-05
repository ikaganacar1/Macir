# backend/grocery/management/commands/seed_defaults.py
"""
Management command: python manage.py seed_defaults --user <username>

Creates default categories and products for an existing user.
Idempotent — skips names that already exist for that user.
Use this to backfill users created before the auto-seed signal existed.
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from grocery.signals import seed_defaults

User = get_user_model()


class Command(BaseCommand):
    help = 'Seed default categories and products for a user'

    def add_arguments(self, parser):
        parser.add_argument('--user', required=True, help='Username to seed defaults for')

    def handle(self, *args, **options):
        username = options['user']
        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            raise CommandError(f'User "{username}" does not exist')

        seed_defaults(user)
        self.stdout.write(self.style.SUCCESS(
            f'Default categories and products seeded for user "{username}".'
        ))
