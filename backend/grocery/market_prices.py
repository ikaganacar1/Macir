import json

import requests
from django.core.cache import cache
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

_BASE_URL = "https://api.marketfiyati.org.tr/api/v2/search"
_HEADERS = {
    "cache-control": "no-cache",
    "content-type": "application/json",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0"
    ),
}
_TIMEOUT = 10


def fetch_market_prices(keywords: str) -> list[dict]:
    try:
        resp = requests.post(
            _BASE_URL,
            headers=_HEADERS,
            data=json.dumps({"keywords": keywords}),
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
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

    cache_key = f"market_price:{keywords.lower()}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response({"results": cached})

    results = fetch_market_prices(keywords)
    cache.set(cache_key, results, timeout=1800)
    return Response({"results": results})
