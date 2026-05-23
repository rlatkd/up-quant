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


def get_candles(market: str, interval: str = "days", count: int = 60) -> list[CandleItem]:
    if interval == "days" and count <= _CANON:
        full = cached(f"candle:{market}:days", config.TTL_CANDLE, lambda: _fetch(market, "days", _CANON))
        return full[-count:] if count < len(full) else full
    key = f"candle:{market}:{interval}:{count}"
    return cached(key, config.TTL_CANDLE, lambda: _fetch(market, interval, count))
