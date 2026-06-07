from fastapi import APIRouter

from app.schemas.analysis import (
    AdvanceDeclineResult,
    CategoryReturns,
    CoinStat,
    CorrelationItem,
)
from app.services import analysis_service

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/advance-decline", response_model=AdvanceDeclineResult)
def get_advance_decline():
    """Advance-Decline 라인 — 시장 폭의 추세(거래대금 상위 100종)."""
    return analysis_service.get_advance_decline()


@router.get("/category/monthly", response_model=CategoryReturns)
def get_monthly():
    return analysis_service.get_category_monthly()


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
