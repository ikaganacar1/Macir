FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV DJANGO_SETTINGS_MODULE=config.settings
ENV DB_DIR=/app/db

RUN mkdir -p /app/db /app/media /app/staticfiles

RUN python manage.py collectstatic --noinput

CMD ["sh", "-c", "python manage.py migrate && python manage.py createcachetable --no-color && gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2"]
