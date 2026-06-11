from fastapi import APIRouter, HTTPException, Query

from app.schemas.report import ReportResult
from app.services import report_service

router = APIRouter(prefix="/api/report", tags=["report"])


@router.get("/strategy", response_model=ReportResult)
def strategy(report_type: str = Query("market", description="market | portfolio | risk")):
    """LLM(Gemini) 투자 전략 리포트 — 부문별 전용 프롬프트로 생성, 종류별 차등 캐시.
    키 미설정·호출 실패·빈 응답이면 자동 초안 없이 502로 오류를 노출한다."""
    try:
        return report_service.generate_report(report_type)
    except Exception as e:
        # 자동 초안 폴백 없음 — 실패 원인을 그대로 프론트에 전달.
        raise HTTPException(status_code=502, detail=str(e))
