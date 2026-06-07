from pydantic import BaseModel


class ReportResult(BaseModel):
    report_type: str       # market | portfolio | risk
    title: str
    markdown: str          # 생성된 리포트 본문(마크다운)
    model: str             # 사용(예정) 모델 ID
    generated_at: int      # unix seconds
    enabled: bool          # 실제 LLM 호출 여부 (False = 미연동, 데이터 기반 자동 초안)
    note: str | None = None
