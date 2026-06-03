from fastapi import APIRouter, Query

from app.schemas.quant import (
    ClusterResult,
    DendrogramResult,
    GarchResult,
    MomentumResult,
    NetworkResult,
    PairsResult,
    PCAResult,
    PortfolioResult,
    RegimeResult,
)
from app.services import quant_service

router = APIRouter(prefix="/api/quant", tags=["quant"])


@router.get("/portfolio", response_model=PortfolioResult)
def get_portfolio(markets: str = Query(..., description="쉼표 구분 마켓 코드 (예: KRW-BTC,KRW-ETH,KRW-XRP), 2~8종목")):
    codes = [m.strip().upper() for m in markets.split(",") if m.strip()][:8]
    return quant_service.get_portfolio(codes)


@router.get("/network", response_model=NetworkResult)
def get_network(top: int = Query(50, ge=5, le=100, description="거래대금 상위 N종 (5~100)")):
    return quant_service.get_network(top)


@router.get("/pca", response_model=PCAResult)
def get_pca(top: int = Query(50, ge=5, le=100, description="거래대금 상위 N종 (5~100)")):
    return quant_service.get_pca(top)


@router.get("/clusters", response_model=ClusterResult)
def get_clusters(
    top: int = Query(80, ge=10, le=150, description="거래대금 상위 N종 (10~150)"),
    k: int = Query(4, ge=2, le=8, description="군집 수 (2~8)"),
):
    return quant_service.get_clusters(top, k)


@router.get("/dendrogram", response_model=DendrogramResult)
def get_dendrogram(top: int = Query(40, ge=5, le=60, description="거래대금 상위 N종 (5~60)")):
    return quant_service.get_dendrogram(top)


@router.get("/garch/{market}", response_model=GarchResult)
def get_garch(market: str):
    return quant_service.get_garch(market.upper())


@router.get("/momentum", response_model=MomentumResult)
def get_momentum(
    top: int = Query(40, ge=10, le=100, description="거래대금 상위 N종 유니버스"),
    lookback: int = Query(20, ge=5, le=60, description="모멘텀 산정 기간(일)"),
    holding: int = Query(5, ge=1, le=20, description="리밸런스 주기(일)"),
):
    return quant_service.get_momentum(top, lookback, holding)


@router.get("/pairs", response_model=PairsResult)
def get_pairs(top: int = Query(50, ge=5, le=80, description="거래대금 상위 N종 유니버스 (5~80)")):
    return quant_service.get_pairs(top)


@router.get("/regime", response_model=RegimeResult)
def get_regime(n_states: int = Query(2, ge=2, le=4, description="국면 수 (2~4, 기본 2=평온/격동)")):
    return quant_service.get_regime(n_states)
