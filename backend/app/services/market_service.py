from app.clients import upbit_rest
from app.core import config
from app.core.cache import cached
from app.schemas.market import Orderbook, OrderbookUnit, MarketSummary, Ticker, Trade
from app.services import candle_service


def _korean_names() -> dict[str, str]:
    """전체 마켓의 market→korean_name 매핑 (장시간 캐시)."""
    return cached(
        "market_all",
        config.TTL_MARKET_ALL,
        lambda: {m["market"]: m["korean_name"] for m in upbit_rest.get_market_all()},
    )


def _valid_markets() -> list[str]:
    """설정한 마켓 중 실제 상장된 것만."""
    names = _korean_names()
    return [m for m in config.MARKETS if m in names]


def _sparkline(market: str) -> list[float]:
    candles = candle_service.get_candles(market, "days", 30)
    return [c.close for c in candles] or [0.0]


def get_tickers() -> list[Ticker]:
    markets = _valid_markets()
    if not markets:
        return []
    names = _korean_names()
    raw = cached(
        f"ticker:{','.join(markets)}",
        config.TTL_TICKER,
        lambda: upbit_rest.get_tickers(markets),
    )

    result: list[Ticker] = []
    for r in raw:
        m = r["market"]
        price = r["trade_price"]
        w52_high = r.get("highest_52_week_price", 0.0) or 0.0
        w52_low = r.get("lowest_52_week_price", 0.0) or 0.0
        result.append(Ticker(
            market=m,
            korean_name=names.get(m, m),
            trade_price=price,
            change=r["change"],
            change_rate=r["signed_change_rate"],
            change_price=r["change_price"],
            acc_trade_price_24h=r["acc_trade_price_24h"],
            high_price=r["high_price"],
            low_price=r["low_price"],
            prev_closing_price=r["prev_closing_price"],
            sparkline=_sparkline(m),
            is_52w_high=bool(w52_high) and price >= w52_high,
            is_52w_low=bool(w52_low) and price <= w52_low,
            w52_high=w52_high,
            w52_low=w52_low,
        ))
    return result


def get_ticker(market: str) -> Ticker | None:
    return next((t for t in get_tickers() if t.market == market), None)


def get_market_summary() -> MarketSummary:
    tickers = get_tickers()
    up = sum(1 for t in tickers if t.change == "RISE")
    down = sum(1 for t in tickers if t.change == "FALL")
    total = sum(t.acc_trade_price_24h for t in tickers)
    btc = next((t for t in tickers if t.market == "KRW-BTC"), None)
    dom = (btc.acc_trade_price_24h / total * 100) if btc and total else 0
    return MarketSummary(
        total_volume=round(total),
        up_count=up,
        down_count=down,
        btc_dominance=round(dom, 1),
    )


def get_orderbook(market: str) -> Orderbook | None:
    ob = cached(
        f"orderbook:{market}",
        config.TTL_ORDERBOOK,
        lambda: upbit_rest.get_orderbook(market),
    )
    if not ob:
        return None
    units = ob.get("orderbook_units", [])
    return Orderbook(
        market=market,
        asks=[OrderbookUnit(price=u["ask_price"], size=u["ask_size"]) for u in units],
        bids=[OrderbookUnit(price=u["bid_price"], size=u["bid_size"]) for u in units],
    )


def get_trades(market: str) -> list[Trade]:
    raw = cached(
        f"trades:{market}",
        config.TTL_TRADES,
        lambda: upbit_rest.get_trades(market, 30),
    )
    return [
        Trade(
            timestamp=int(t["timestamp"] // 1000),  # Upbit ms → 초 (프론트가 ×1000)
            price=t["trade_price"],
            volume=t["trade_volume"],
            side=t["ask_bid"],  # BID | ASK
        )
        for t in raw
    ]
