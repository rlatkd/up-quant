"""트렌드 대시보드 — 업비트 '코인동향' 미러. 자체 지수·기간수익·시황(자체) + 환율·뉴스(외부)."""
from fastapi import APIRouter

from app.schemas.trends import (
    AssetIndices,
    FxResult,
    MarketBrief,
    NewsResult,
    PeriodReturns,
    TrendsIndices,
    VolumePower,
)
from app.services import fx_service, news_service, trends_service

router = APIRouter(prefix="/api/trends", tags=["trends"])


@router.get("/indices", response_model=TrendsIndices)
def indices():
    return trends_service.get_indices()


@router.get("/asset-indices", response_model=AssetIndices)
def asset_indices():
    return trends_service.get_asset_indices()


@router.get("/volume-power", response_model=VolumePower)
def volume_power():
    return trends_service.get_volume_power()


@router.get("/period-returns", response_model=PeriodReturns)
def period_returns():
    return trends_service.get_period_returns()


@router.get("/brief", response_model=MarketBrief)
def brief():
    return trends_service.get_brief()


@router.get("/fx", response_model=FxResult)
def fx():
    return fx_service.get_fx()


@router.get("/news", response_model=NewsResult)
def news():
    return news_service.get_news()
