# backend/grocery/apps.py
"""Django app config for the Grocery module."""

from django.apps import AppConfig


class GroceryConfig(AppConfig):
    """Grocery app config."""

    name = 'grocery'

    def ready(self):
        import grocery.signals  # noqa: F401 — registers signal handlers
