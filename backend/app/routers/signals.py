"""실행 가능한 시그널 — 정량 분석 결과를 모은 액션 피드(모멘텀·페어·국면·돌파)."""
from fastapi import APIRouter

from app.schemas.signal import SignalsResult
from app.services import signal_service

router = APIRouter(prefix="/api/signals", tags=["signals"])


@router.get("", response_model=SignalsResult)
def signals():
    return signal_service.get_signals()
