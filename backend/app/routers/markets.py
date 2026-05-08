from fastapi import APIRouter, HTTPException

from app.schemas.market import Orderbook, MarketSummary, Ticker, Trade
from app.services import market_service

router = APIRouter(prefix="/api/markets", tags=["markets"])


@router.get("/tickers", response_model=list[Ticker])
def get_tickers():
    return market_service.get_tickers()


@router.get("/tickers/{market}", response_model=Ticker)
def get_ticker(market: str):
    ticker = market_service.get_ticker(market)
    if not ticker:
        raise HTTPException(status_code=404, detail="Market not found")
    return ticker


@router.get("/summary", response_model=MarketSummary)
def get_summary():
    return market_service.get_market_summary()


@router.get("/orderbook/{market}", response_model=Orderbook)
def get_orderbook(market: str):
    ob = market_service.get_orderbook(market)
    if not ob:
        raise HTTPException(status_code=404, detail="Market not found")
    return ob


@router.get("/trades/{market}", response_model=list[Trade])
def get_trades(market: str):
    trades = market_service.get_trades(market)
    if not trades:
        raise HTTPException(status_code=404, detail="Market not found")
    return trades
