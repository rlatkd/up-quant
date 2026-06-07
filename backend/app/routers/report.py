from fastapi import APIRouter, Query

from app.schemas.report import ReportResult
from app.services import report_service

router = APIRouter(prefix="/api/report", tags=["report"])


@router.get("/strategy", response_model=ReportResult)
def strategy(report_type: str = Query("market", description="market | portfolio | risk")):
    """LLM(Gemini) 투자 전략 리포트 — 종류별 차등 캐시(market 2h / portfolio·risk 6h).
    LLM 호출부는 현재 주석 처리(미연동) — 데이터 기반 자동 초안을 반환한다."""
    return report_service.generate_report(report_type)
