from fastapi import APIRouter, Query

from app.schemas.backtest import (
    BacktestResult,
    MonteCarloResult,
    PortfolioBacktestResult,
    StrategyCompareResult,
    TsmomResult,
    WalkForwardResult,
)
from app.services import backtest_service

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


@router.get("/ma-cross", response_model=BacktestResult)
def ma_cross(
    market: str = Query("KRW-BTC"),
    fast: int   = Query(5,   ge=2, le=50),
    slow: int   = Query(20,  ge=5, le=200),
    count: int  = Query(200, ge=60, le=500),
    fee_bps: float = Query(5.0, ge=0, le=100, description="편도 거래비용(bps, 1bps=0.01%)"),
    target_vol: float = Query(0.0, ge=0, le=2, description="변동성 타게팅 목표(연율, 0=올인)"),
):
    return backtest_service.run_ma_cross(market, fast, slow, count, fee_bps, target_vol)


@router.get("/rsi", response_model=BacktestResult)
def rsi_strategy(
    market: str     = Query("KRW-BTC"),
    period: int     = Query(14,   ge=5,  le=30),
    oversold: float = Query(30.0, ge=10, le=45),
    overbought: float = Query(70.0, ge=55, le=90),
    count: int      = Query(200,  ge=60, le=500),
    fee_bps: float  = Query(5.0, ge=0, le=100, description="편도 거래비용(bps, 1bps=0.01%)"),
    target_vol: float = Query(0.0, ge=0, le=2, description="변동성 타게팅 목표(연율, 0=올인)"),
):
    return backtest_service.run_rsi_strategy(market, period, oversold, overbought, count, fee_bps, target_vol)


@router.get("/compare", response_model=StrategyCompareResult)
def compare(
    market: str = Query("KRW-BTC"),
    count: int  = Query(200, ge=60, le=500),
    fee_bps: float = Query(5.0, ge=0, le=100),
):
    return backtest_service.run_compare(market, count, fee_bps)


@router.get("/walk-forward", response_model=WalkForwardResult)
def walk_forward(
    market: str = Query("KRW-BTC"),
    count: int  = Query(300, ge=120, le=500),
    n_splits: int = Query(4, ge=2, le=8),
    fee_bps: float = Query(5.0, ge=0, le=100),
):
    return backtest_service.run_walk_forward(market, count, n_splits, fee_bps)


@router.get("/tsmom", response_model=TsmomResult)
def tsmom(
    top: int = Query(30, ge=10, le=100, description="유니버스 종목 수(거래대금 상위)"),
    lookback: int = Query(60, ge=10, le=180, description="추세 판단 룩백(일)"),
    holding: int = Query(5, ge=1, le=30, description="리밸런스 주기(일)"),
    count: int = Query(200, ge=120, le=500),
    fee_bps: float = Query(5.0, ge=0, le=100),
):
    return backtest_service.run_tsmom(top, lookback, holding, count, fee_bps)


@router.get("/montecarlo", response_model=MonteCarloResult)
def montecarlo(
    market: str = Query("KRW-BTC"),
    horizon: int = Query(30, ge=5, le=120, description="시뮬레이션 일수"),
    n_paths: int = Query(1000, ge=200, le=5000, description="경로 수"),
    count: int = Query(180, ge=60, le=500, description="과거 수익률 추정 윈도우(일봉)"),
):
    return backtest_service.run_montecarlo(market, horizon, n_paths, count)


@router.get("/portfolio", response_model=PortfolioBacktestResult)
def portfolio(
    markets: str = Query(..., description="쉼표 구분 마켓 코드 (예: KRW-BTC,KRW-ETH)"),
    weights: str | None = Query(None, description="쉼표 구분 비중 (markets와 같은 개수, 생략 시 동일가중)"),
    count: int = Query(180, ge=30, le=500, description="일봉 기간"),
    rebalance_days: int = Query(0, ge=0, le=90, description="리밸런스 주기(일), 0=매수보유"),
    fee_bps: float = Query(5.0, ge=0, le=100, description="편도 거래비용(bps, 1bps=0.01%)"),
):
    codes = [m.strip().upper() for m in markets.split(",") if m.strip()][:10]
    w = None
    if weights:
        try:
            w = [float(x) for x in weights.split(",") if x.strip()]
        except ValueError:
            w = None
    return backtest_service.run_portfolio(codes, w, count, rebalance_days, fee_bps)
