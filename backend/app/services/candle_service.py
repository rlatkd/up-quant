from datetime import datetime, timezone

from app.clients import upbit_rest
from app.core import config
from app.core.cache import cached
from app.schemas.candle import CandleItem


def _to_ms(dt_utc: str) -> int:
    """'2024-01-01T00:00:00' (UTC, tz 없음) → Unix 밀리초"""
    return int(datetime.fromisoformat(dt_utc).replace(tzinfo=timezone.utc).timestamp() * 1000)


def _fetch(market: str, interval: str, count: int) -> list[CandleItem]:
    # Upbit는 최신순으로 최대 200개씩 반환. count>200이면 to 파라미터로 과거 방향 페이지네이션.
    raw: list[dict] = []
    remaining = count
    to: str | None = None
    while remaining > 0:
        batch = upbit_rest.get_candles(interval, market, min(remaining, 200), to)
        if not batch:
            break
        raw.extend(batch)
        remaining -= len(batch)
        if len(batch) < 200:
            break
        to = batch[-1]["candle_date_time_utc"] + "Z"  # 가장 오래된 캔들 이전을 조회

    # 시각 기준 중복 제거 후 오래된→최신 순 정렬 (lightweight-charts는 오름차순·고유 시각 필요)
    uniq = {c["candle_date_time_utc"]: c for c in raw}
    rows = sorted(uniq.values(), key=lambda c: c["candle_date_time_utc"])

    items = [
        CandleItem(
            timestamp=_to_ms(c["candle_date_time_utc"]),
            open=c["opening_price"],
            high=c["high_price"],
            low=c["low_price"],
            close=c["trade_price"],
            volume=c["candle_acc_trade_volume"],
        )
        for c in rows
    ]
    return items[-count:]


# 일봉은 종목별로 200개를 한 번만 받아 캐시하고, 요청 수만큼 잘라 공유한다.
# (스파크라인 30 / 통계 30 / 상관관계 60 / 상세 120 등이 같은 캐시를 재사용 → 호출 폭증 방지)
_CANON = 200
# 월봉도 같은 canonical 패턴. 월봉 최대 요청치는 기간수익률(1년=13개월)·섹터 월봉의 61.
# 고정 키 하나로 받아 슬라이스 공유 → 여러 집계가 종목당 월봉을 1번만 받는다.
_CANON_MONTHS = 61


def get_candles(market: str, interval: str = "days", count: int = 60) -> list[CandleItem]:
    # 일봉·주봉·월봉은 '느린' 캔들 — canonical 1회 fetch + 장기 TTL로 슬라이스 공유(집계 팬아웃 억제).
    if interval == "days" and count <= _CANON:
        full = cached(f"candle:{market}:days", config.TTL_CANDLE_DAYS, lambda: _fetch(market, "days", _CANON))
        return full[-count:] if count < len(full) else full
    if interval == "months" and count <= _CANON_MONTHS:
        full = cached(f"candle:{market}:months", config.TTL_CANDLE_LONG, lambda: _fetch(market, "months", _CANON_MONTHS))
        return full[-count:] if count < len(full) else full
    if interval == "weeks" and count <= _CANON:
        full = cached(f"candle:{market}:weeks", config.TTL_CANDLE_LONG, lambda: _fetch(market, "weeks", _CANON))
        return full[-count:] if count < len(full) else full
    # 분봉(인트라데이) 등은 짧은 TTL — 라이브 차트 신선도 우선.
    key = f"candle:{market}:{interval}:{count}"
    return cached(key, config.TTL_CANDLE, lambda: _fetch(market, interval, count))
