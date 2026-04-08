import logging

import requests
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from grocery.models import StoreProfile

_BASE_URL = "https://api.marketfiyati.org.tr/api/v2/search"
_HEADERS = {
    "cache-control": "no-cache",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
    ),
}
_TIMEOUT = 10
_DEFAULT_LAT = 41.0082
_DEFAULT_LNG = 28.9784
_DEFAULT_RADIUS = 5
_MAX_RADIUS = 10

logger = logging.getLogger(__name__)


def fetch_market_prices(
    keywords: str,
    latitude: float = _DEFAULT_LAT,
    longitude: float = _DEFAULT_LNG,
    radius_km: int = _DEFAULT_RADIUS,
) -> list[dict]:
    try:
        resp = requests.post(
            _BASE_URL,
            headers=_HEADERS,
            json={
                "keywords": keywords,
                "latitude": latitude,
                "longitude": longitude,
                "distance": radius_km,
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.warning("fetch_market_prices failed for %r: %s", keywords, e)
        return []

    results = []
    for item in data.get("content", []):
        depots = item.get("productDepotInfoList", [])
        sorted_depots = sorted(depots, key=lambda d: d.get("price", 0))[:5]
        cheapest_stores = [
            {
                "market": d.get("marketAdi", ""),
                "price": d.get("price", 0),
                "unitPrice": d.get("unitPrice", ""),
            }
            for d in sorted_depots
        ]
        results.append({
            "id": item.get("id", ""),
            "title": item.get("title", ""),
            "brand": item.get("brand", ""),
            "imageUrl": item.get("imageUrl"),
            "cheapest_stores": cheapest_stores,
        })
    return results


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def market_price_search(request):
    keywords = request.query_params.get("q", "").strip()
    if not keywords:
        return Response({"results": [], "error": "missing q"}, status=400)

    profile, _ = StoreProfile.objects.get_or_create(
        owner=request.user,
        defaults={
            "latitude": _DEFAULT_LAT,
            "longitude": _DEFAULT_LNG,
            "search_radius_km": _DEFAULT_RADIUS,  # 5km
        },
    )
    lat = profile.latitude
    lng = profile.longitude
    radius = min(profile.search_radius_km, _MAX_RADIUS)

    cache_key = f"market_price:{keywords.lower()}:{lat:.4f}:{lng:.4f}:{radius}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response({"results": cached})

    results = fetch_market_prices(keywords, lat, lng, radius)
    cache.set(cache_key, results, timeout=1800)
    return Response({"results": results})
