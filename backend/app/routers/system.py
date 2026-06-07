from fastapi import APIRouter

from app.core import metrics

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/metrics")
def get_metrics():
    """관측성 메트릭 — 캐시 적중률·외부 호출수·평균 응답시간·최근 요청(rid)."""
    return metrics.snapshot()
