# backend/grocery/migrations/0003_add_owner.py
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def populate_owner(apps, schema_editor):
    """Assign all existing rows to the first superuser."""
    User = apps.get_model('auth', 'User')
    superuser = User.objects.filter(is_superuser=True).order_by('pk').first()
    if superuser is None:
        return  # empty DB, nothing to backfill
    for model_name in ('Category', 'Product', 'StockEntry', 'SaleRecord'):
        Model = apps.get_model('grocery', model_name)
        Model.objects.filter(owner__isnull=True).update(owner=superuser)


class Migration(migrations.Migration):

    dependencies = [
        ('grocery', '0002_alter_product_name_alter_product_svg_icon_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Add owner nullable to all four models
        migrations.AddField(
            model_name='category',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='products',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AddField(
            model_name='stockentry',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='stock_entries',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AddField(
            model_name='salerecord',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sale_records',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        # 2. Backfill existing rows
        migrations.RunPython(populate_owner, migrations.RunPython.noop),
        # 3. Make non-nullable
        migrations.AlterField(
            model_name='category',
            name='owner',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AlterField(
            model_name='product',
            name='owner',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='products',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AlterField(
            model_name='stockentry',
            name='owner',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='stock_entries',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        migrations.AlterField(
            model_name='salerecord',
            name='owner',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sale_records',
                to=settings.AUTH_USER_MODEL,
                verbose_name='Owner',
            ),
        ),
        # 4. Drop old global unique on name, add unique_together with owner
        migrations.AlterUniqueTogether(
            name='category',
            unique_together={('owner', 'name')},
        ),
        migrations.AlterUniqueTogether(
            name='product',
            unique_together={('owner', 'name')},
        ),
    ]
