from fastapi import APIRouter

from app.schemas.candle import CandleItem
from app.services import candle_service

router = APIRouter(prefix="/api/candles", tags=["candles"])


@router.get("/{market}", response_model=list[CandleItem])
def get_candles(market: str, interval: str = "days", count: int = 60):
    return candle_service.get_candles(market, interval, count)
