from fastapi import APIRouter

from app.schemas.analysis import CategoryMonthly, CoinStat
from app.services import analysis_service

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/category/monthly", response_model=list[CategoryMonthly])
def get_monthly():
    return analysis_service.get_category_monthly()


@router.get("/category/cumulative", response_model=list[CategoryMonthly])
def get_cumulative():
    return analysis_service.get_category_cumulative()


@router.get("/coins", response_model=list[CoinStat])
def get_coin_stats():
    return analysis_service.get_coin_stats()
