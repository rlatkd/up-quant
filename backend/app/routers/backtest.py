from fastapi import APIRouter, Query

from app.schemas.backtest import BacktestResult, PortfolioBacktestResult
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


@router.get("/portfolio", response_model=PortfolioBacktestResult)
def portfolio(
    markets: str = Query(..., description="쉼표 구분 마켓 코드 (예: KRW-BTC,KRW-ETH)"),
    weights: str | None = Query(None, description="쉼표 구분 비중 (markets와 같은 개수, 생략 시 동일가중)"),
    count: int = Query(180, ge=30, le=500, description="일봉 기간"),
    rebalance_days: int = Query(0, ge=0, le=90, description="리밸런스 주기(일), 0=매수보유"),
):
    codes = [m.strip().upper() for m in markets.split(",") if m.strip()][:10]
    w = None
    if weights:
        try:
            w = [float(x) for x in weights.split(",") if x.strip()]
        except ValueError:
            w = None
    return backtest_service.run_portfolio(codes, w, count, rebalance_days)
