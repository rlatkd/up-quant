from fastapi import APIRouter, Query

from app.schemas.backtest import BacktestResult
from app.services import backtest_service

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


@router.get("/ma-cross", response_model=BacktestResult)
def ma_cross(
    market: str = Query("KRW-BTC"),
    fast: int   = Query(5,   ge=2, le=50),
    slow: int   = Query(20,  ge=5, le=200),
    count: int  = Query(200, ge=60, le=500),
):
    return backtest_service.run_ma_cross(market, fast, slow, count)


@router.get("/rsi", response_model=BacktestResult)
def rsi_strategy(
    market: str     = Query("KRW-BTC"),
    period: int     = Query(14,   ge=5,  le=30),
    oversold: float = Query(30.0, ge=10, le=45),
    overbought: float = Query(70.0, ge=55, le=90),
    count: int      = Query(200,  ge=60, le=500),
):
    return backtest_service.run_rsi_strategy(market, period, oversold, overbought, count)
