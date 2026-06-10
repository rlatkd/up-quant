"""환율 — 외부 무료 FX API(open.er-api.com, 무인증)를 백엔드가 프록시 + 캐시.
업비트 코인동향의 '오늘의 환율'(USD·JPY·CNY·EUR / KRW) 미러.
⚠️ 외부 소스라 가용성 변동 가능 — 실패 시 숨기지 않고 "소스 교체 필요"를 명시해 반환한다."""
from datetime import datetime, timezone, timedelta

import httpx

from app.core import metrics
from app.core.cache import cached
from app.schemas.trends import FxResult, FxRate

_KST = timezone(timedelta(hours=9))
_FX_URL = "https://open.er-api.com/v6/latest/USD"
# (코드, 한글 라벨, 표시 단위) — 업비트는 JPY를 100엔 기준으로 표기.
_PAIRS = [("USD", "미국", 1), ("JPY", "일본", 100), ("CNY", "중국", 1), ("EUR", "유로", 1)]
_prev: dict[str, float] = {}   # 전일대비 계산용 직전 값(프로세스 내 best-effort)


def _now() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%d %H:%M KST")


def _fetch() -> FxResult:
    r = httpx.get(_FX_URL, timeout=4.0)   # 4초 — 넘으면 죽은 소스로 보고 에러(짧게 캐시)
    r.raise_for_status()
    d = r.json()
    rates = d.get("rates", {})
    krw = rates.get("KRW")
    if not krw:
        raise ValueError("KRW rate missing")
    metrics.record_source("fx", ok=True)
    out: list[FxRate] = []
    for code, label, unit in _PAIRS:
        rx = rates.get(code)
        if not rx:
            continue
        price = round(krw / rx * unit, 2)   # 1(또는 100) 단위당 KRW
        prev = _prev.get(code)
        change = round(price - prev, 2) if prev else 0.0
        change_rate = round(price / prev - 1, 4) if prev else 0.0
        _prev[code] = price
        out.append(FxRate(pair=f"{code}/KRW", label=label, unit=unit,
                          price=price, change=change, change_rate=change_rate))
    return FxResult(rates=out, as_of=_now(), error=None)


def _build() -> FxResult:
    # 성공은 10분 캐시, 실패는 에러 결과를 60초만 캐시(죽은 소스에 진입할 때마다 매번 매달리지 않게).
    try:
        return _fetch()
    except Exception as e:  # noqa: BLE001
        metrics.record_source("fx", ok=False, error=str(e))
        return FxResult(rates=[], as_of=_now(),
                        error=f"환율 소스 연결 실패 — 소스 교체 필요 ({type(e).__name__})")


def get_fx() -> FxResult:
    """성공 10분 / 에러 60초 캐시(callable TTL). 외부 실패도 화면에 숨기지 않고 에러 메시지로 노출."""
    return cached("trends:fx", lambda r: 60 if r.error else 600, _build)
