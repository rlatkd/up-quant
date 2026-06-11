"""최신 뉴스 — 한국 크립토 뉴스 RSS를 백엔드가 파싱·통합·캐시(헤드라인+링크만, 전문 복제 X).
업비트 코인동향의 '최신 뉴스' 미러. 클릭 시 원문 새 탭(프론트).
⚠️ 외부 RSS라 포맷·가용성 변동 가능 — 전부 실패하면 숨기지 않고 "소스 교체 필요"를 명시해 반환한다."""
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

import httpx

from app.core import metrics
from app.core.cache import cached
from app.schemas.trends import NewsResult, NewsItem

logger = logging.getLogger("upquant")
_KST = timezone(timedelta(hours=9))

# 한국 크립토 뉴스 RSS (best-effort, 교체 쉬움). 응답하는 피드만 사용.
_FEEDS = [
    ("블록미디어", "https://www.blockmedia.co.kr/feed"),
    ("토큰포스트", "https://www.tokenpost.kr/rss"),
    # 코인데스크코리아 RSS는 폐기(이제 HTML 페이지를 반환) → 블록체인투데이로 교체.
    ("블록체인투데이", "https://www.blockchaintoday.co.kr/rss/allArticle.xml"),
]
_LIMIT = 20   # 프론트에서 페이지네이션(PDF의 1/5 ‹ ›)


def _rel_time(ts: int) -> str:
    if not ts:
        return ""
    sec = int(datetime.now(timezone.utc).timestamp()) - ts
    if sec < 60:
        return "방금 전"
    if sec < 3600:
        return f"{sec // 60}분 전"
    if sec < 86400:
        return f"{sec // 3600}시간 전"
    return f"{sec // 86400}일 전"


def _parse_ts(s: str | None) -> int:
    if not s:
        return 0
    try:
        return int(parsedate_to_datetime(s).timestamp())   # RSS pubDate
    except Exception:  # noqa: BLE001
        try:
            return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())  # Atom ISO
        except Exception:  # noqa: BLE001
            return 0


# 일부 RSS는 본문에 이스케이프 안 된 '&'나 XML 비허용 제어문자가 섞여 엄격 파서(ElementTree)가
# "not well-formed (invalid token)"으로 죽는다(예: 코인데스크코리아). 파싱 전에 정규화한다.
_BARE_AMP = re.compile(r'&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)')
_BAD_CTRL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')


def _sanitize_xml(xml: str) -> str:
    return _BARE_AMP.sub('&amp;', _BAD_CTRL.sub('', xml))


def _parse_feed(source: str, xml: str) -> list[NewsItem]:
    items: list[NewsItem] = []
    # 폐기된 피드는 RSS 대신 HTML 페이지를 반환한다(코인데스크코리아 사례) → 깔끔히 건너뛰게 명확한 사유로.
    head = xml.lstrip()[:200].lower()
    if not (head.startswith('<?xml') or head.startswith('<rss') or head.startswith('<feed')) and \
       ('<!doctype html' in head or '<html' in head):
        raise ValueError("RSS가 아닌 HTML 응답 — 피드 폐기 추정")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        root = ET.fromstring(_sanitize_xml(xml))   # bare & / 제어문자 정규화 후 재시도
    # RSS 2.0: channel/item, Atom: feed/entry
    nodes = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
    for n in nodes:
        title = (n.findtext("title") or n.findtext("{http://www.w3.org/2005/Atom}title") or "").strip()
        link = n.findtext("link") or ""
        if not link:  # Atom: <link href="">
            le = n.find("{http://www.w3.org/2005/Atom}link")
            link = le.get("href") if le is not None else ""
        pub = n.findtext("pubDate") or n.findtext("{http://www.w3.org/2005/Atom}published") \
            or n.findtext("{http://www.w3.org/2005/Atom}updated")
        ts = _parse_ts(pub)
        if title and link:
            items.append(NewsItem(title=title, url=link.strip(), source=source,
                                  published=_rel_time(ts), ts=ts))
    return items


def _fetch() -> NewsResult:
    collected: list[NewsItem] = []
    errors = 0
    for source, url in _FEEDS:
        try:
            r = httpx.get(url, timeout=4.0, follow_redirects=True,
                          headers={"User-Agent": "Mozilla/5.0 (UPquant)"})
            r.raise_for_status()
            collected.extend(_parse_feed(source, r.text))
        except Exception as e:  # noqa: BLE001 — 일부 피드 실패는 무시하고 나머지로
            errors += 1
            logger.info("news feed 실패(%s): %s", source, e)
    if not collected:
        # 전부 실패 → 숨기지 않고 교체 필요 명시
        metrics.record_source("news", ok=False, error=f"{errors} feeds failed")
        return NewsResult(items=[], error="뉴스 소스 연결 실패 — 소스 교체 필요 (RSS 응답 없음)")
    metrics.record_source("news", ok=True)
    collected.sort(key=lambda x: x.ts, reverse=True)
    # 시간 미상(ts=0)은 뒤로 밀리되 포함. 중복 제목 제거.
    seen, uniq = set(), []
    for it in collected:
        if it.title in seen:
            continue
        seen.add(it.title)
        uniq.append(it)
    return NewsResult(items=uniq[:_LIMIT], error=None)


def _build() -> NewsResult:
    try:
        return _fetch()
    except Exception as e:  # noqa: BLE001
        metrics.record_source("news", ok=False, error=str(e))
        return NewsResult(items=[], error=f"뉴스 소스 연결 실패 — 소스 교체 필요 ({type(e).__name__})")


def get_news() -> NewsResult:
    """성공 10분 / 에러 60초 캐시(죽은 RSS에 매 진입마다 매달리지 않게). 전부 실패 시 에러 메시지 노출."""
    return cached("trends:news", lambda r: 60 if r.error else 600, _build)
