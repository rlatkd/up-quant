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


@router.get("/coins", response_model=list[CoinStat])
def get_coin_stats():
    return analysis_service.get_coin_stats()


@router.get("/correlation/{market}", response_model=list[CorrelationItem])
def get_correlation(market: str):
    return analysis_service.get_correlation(market)
