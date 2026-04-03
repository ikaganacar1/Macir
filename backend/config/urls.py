from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.urls import include, path
from django.views.decorators.http import require_POST

from grocery.api import grocery_api_urls


def auth_status(request):
    if request.user.is_authenticated:
        return JsonResponse({'authenticated': True, 'username': request.user.username})
    return JsonResponse({'authenticated': False}, status=401)


def csrf_view(request):
    return JsonResponse({'csrfToken': get_token(request)})


@require_POST
def api_login(request):
    import json
    data = json.loads(request.body)
    user = authenticate(request, username=data.get('username', ''), password=data.get('password', ''))
    if user:
        login(request, user)
        return JsonResponse({'authenticated': True, 'username': user.username})
    return JsonResponse({'error': 'Invalid credentials'}, status=401)


@require_POST
def api_logout(request):
    logout(request)
    return JsonResponse({'authenticated': False})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/grocery/', include(grocery_api_urls)),
    path('api/auth/status/', auth_status),
    path('api/auth/csrf/', csrf_view),
    path('api/auth/login/', api_login),
    path('api/auth/logout/', api_logout),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
