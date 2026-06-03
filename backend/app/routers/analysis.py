from fastapi import APIRouter, Query

from app.schemas.analysis import CategoryReturns, CoinStat, CorrelationItem
from app.services import analysis_service

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/category/monthly", response_model=CategoryReturns)
def get_monthly():
    return analysis_service.get_category_monthly()


@router.get("/category/cumulative", response_model=CategoryReturns)
def get_cumulative(period: str = Query("월", description="월|분기|년")):
    return analysis_service.get_category_cumulative(period)


@router.get("/category/cumulative-daily", response_model=CategoryReturns)
def get_cumulative_daily():
    """섹터별 일간 동일가중 누적 등락률(최근 ~200일)."""
    return analysis_service.get_category_daily_cumulative()


@router.get("/coins", response_model=list[CoinStat])
def get_coin_stats():
    return analysis_service.get_coin_stats()


@router.get("/correlation/{market}", response_model=list[CorrelationItem])
def get_correlation(market: str):
    return analysis_service.get_correlation(market)
