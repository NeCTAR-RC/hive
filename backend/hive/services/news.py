"""The ARDC news feed, proxied and cached (as the Horizon home page does)."""

from html.parser import HTMLParser

from defusedxml import ElementTree
import httpx

from hive.cache.redis import Cache, CacheResult
from hive.errors import UpstreamError, UpstreamTimeout

TTL = 3600
STALE_TTL = 86400
MAX_ITEMS = 10
NS = {
    "media": "http://search.yahoo.com/mrss/",
    "content": "http://purl.org/rss/1.0/modules/content/",
}


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data):
        self.parts.append(data)


def strip_html(value: str | None, limit: int = 300) -> str:
    if not value:
        return ""
    parser = _TextExtractor()
    parser.feed(value)
    text = " ".join(" ".join(parser.parts).split())
    return text[:limit].rstrip() + ("..." if len(text) > limit else "")


def parse_feed(xml: bytes | str) -> list[dict]:
    root = ElementTree.fromstring(xml)
    items = []
    for item in root.iter("item"):
        image = None
        media = item.find("media:content", NS)
        if media is not None:
            image = media.get("url")
        enclosure = item.find("enclosure")
        if image is None and enclosure is not None:
            image = enclosure.get("url")
        items.append(
            {
                "title": (item.findtext("title") or "").strip(),
                "link": (item.findtext("link") or "").strip(),
                "published": (item.findtext("pubDate") or "").strip(),
                "summary": strip_html(
                    item.findtext("description")
                    or item.findtext("content:encoded", namespaces=NS)
                ),
                "image": image,
            }
        )
        if len(items) >= MAX_ITEMS:
            break
    return items


async def ardc_news(
    http: httpx.AsyncClient, cache: Cache, url: str
) -> CacheResult:
    async def fetch():
        try:
            resp = await http.get(url, timeout=httpx.Timeout(10.0))
        except httpx.TimeoutException as exc:
            raise UpstreamTimeout(
                "news feed timed out", service="rss"
            ) from exc
        except httpx.HTTPError as exc:
            raise UpstreamError(
                f"news feed failed: {exc}", service="rss"
            ) from exc
        if resp.status_code != 200:
            raise UpstreamError(
                f"news feed returned {resp.status_code}",
                service="rss",
                upstream_status=resp.status_code,
            )
        try:
            return parse_feed(resp.content)
        except ElementTree.ParseError as exc:
            raise UpstreamError(
                "news feed is not valid XML", service="rss"
            ) from exc

    return await cache.get_or_fetch(
        cache.global_key("news", "ardc"),
        fetch,
        ttl=TTL,
        stale_ttl=STALE_TTL,
        name="news",
    )
