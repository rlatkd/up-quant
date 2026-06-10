"""실행 가능한 시그널 집계 응답 스키마.

흩어져 있던 정량 분석 결과(모멘텀 진입·페어 z>2·국면 전환·52주 신고가/급등)를 한 곳에 모아
'지금 무엇을 할 수 있는가'를 보여주고, 프론트가 deep-link/알림으로 연결한다.
모든 값은 기존 캐시(get_momentum·get_pairs·get_regime·tickers) 재사용이라 추가 팬아웃 0."""
from pydantic import BaseModel


class SignalItem(BaseModel):
    kind: str               # momentum | pair | regime | breakout
    market: str = ""        # 대표 종목(있으면) — deep-link/알림 대상
    korean_name: str = ""
    title: str              # 표시 제목(예: "BTC 모멘텀 롱 진입")
    detail: str = ""        # 부가 설명
    value: float = 0.0      # 핵심 수치(모멘텀%·z점수·등락률% 등)
    action: str = ""        # 클릭 시 이동 경로(예: /coins/KRW-BTC, /factor, /regime)


class SignalsResult(BaseModel):
    as_of: str
    regime_label: str       # 현재 시장 국면(HMM)
    regime_changed: bool    # 직전 봉 대비 국면이 바뀌었는지(전환 시그널)
    items: list[SignalItem]
    n: int
