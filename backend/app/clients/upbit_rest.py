import httpx

_BASE = "https://api.upbit.com/v1"
_TIMEOUT = httpx.Timeout(10.0)


async def _get(path: str, params: dict | None = None) -> list | dict:
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(f"{_BASE}{path}", params=params)
        r.raise_for_status()
        return r.json()


async def get_tickers(markets: list[str]) -> list[dict]:
    return await _get("/ticker", {"markets": ",".join(markets)})


async def get_candles_minutes(market: str, unit: int = 1, count: int = 60) -> list[dict]:
    return await _get(f"/candles/minutes/{unit}", {"market": market, "count": min(count, 200)})


async def get_candles_days(market: str, count: int = 60) -> list[dict]:
    return await _get("/candles/days", {"market": market, "count": min(count, 200)})


async def get_candles_weeks(market: str, count: int = 52) -> list[dict]:
    return await _get("/candles/weeks", {"market": market, "count": min(count, 200)})


async def get_candles_months(market: str, count: int = 6) -> list[dict]:
    return await _get("/candles/months", {"market": market, "count": min(count, 36)})


async def get_orderbook(market: str) -> dict | None:
    data = await _get("/orderbook", {"markets": market})
    return data[0] if data else None


async def get_trades(market: str, count: int = 20) -> list[dict]:
    return await _get("/trades/ticks", {"market": market, "count": min(count, 500)})
