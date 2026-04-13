from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.environ.get('DEBUG', 'false').lower() == 'true'

SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production')
if not DEBUG and SECRET_KEY == 'dev-secret-change-in-production':
    raise RuntimeError(
        "SECRET_KEY environment variable must be set to a strong random value in production. "
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(50))\""
    )

ALLOWED_HOSTS = [
    h.strip()
    for h in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
    if h.strip()
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'axes',
    'grocery',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'axes.middleware.AxesMiddleware',
]

ROOT_URLCONF = 'config.urls'
WSGI_APPLICATION = 'config.wsgi.application'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': Path(os.environ.get('DB_DIR', BASE_DIR)) / 'db.sqlite3',
    }
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'django_cache',
    }
}

TIME_ZONE = 'Europe/Istanbul'
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
}
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'login': '5/minute',
    },
}

_extra_origins = [
    o.strip() for o in os.environ.get('EXTRA_ALLOWED_ORIGINS', '').split(',') if o.strip()
]

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:25565',
    'http://127.0.0.1:25565',
    'http://localhost:5173',
] + _extra_origins

CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:25565',
    'http://127.0.0.1:25565',
] + _extra_origins

CORS_ALLOW_CREDENTIALS = True
CSRF_COOKIE_HTTPONLY = False   # JS needs to read it
CSRF_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SAMESITE = 'Lax'

# Set HTTPS=true in .env once TLS termination is in place (Cloudflare, nginx SSL, etc.)
_https_enabled = os.environ.get('HTTPS', 'false').lower() == 'true'
SESSION_COOKIE_SECURE = _https_enabled
CSRF_COOKIE_SECURE = _https_enabled
SECURE_SSL_REDIRECT = _https_enabled
SECURE_HSTS_SECONDS = 31536000 if _https_enabled else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = _https_enabled
# Cloudflare (and any TLS-terminating proxy) sends this header — trust it so
# Django knows the original request was HTTPS and doesn't loop on SSL redirect.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https') if _https_enabled else None

AUTHENTICATION_BACKENDS = [
    'axes.backends.AxesStandaloneBackend',  # must be first
    'django.contrib.auth.backends.ModelBackend',
]

AXES_FAILURE_LIMIT = 10           # lock after 10 consecutive failures
AXES_COOLOFF_TIME = 1             # locked for 1 hour
AXES_LOCKOUT_PARAMETERS = ['username']  # lock by username (not just IP)
AXES_RESET_ON_SUCCESS = True      # reset counter on successful login
AXES_HTTP_RESPONSE_CODE = 403     # return 403 on lockout (distinct from 401 wrong password)
AXES_ENABLED = True               # can be overridden in tests with @override_settings

ADMIN_URL = os.environ.get('ADMIN_URL', 'admin/')
