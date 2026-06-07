"""LLM 투자 전략 리포트 생성 — 서비스 데이터(시장·종목·정량지표)를 모아 LLM에게 표준 투자
리서치 리포트 형식의 마크다운을 생성하게 한다.

규칙:
- **LLM = Google Gemini** (실제 호출부는 주석 처리 — API 키·비용 발생. 프롬프트·데이터 주입·SDK
  호출 코드는 완성해 둠. `GEMINI_API_KEY` 넣고 주석을 풀면 동작).
- **1시간 캐시**: LLM은 호출마다 답이 달라질 수 있어, 리포트 종류별로 1시간 동안은 처음 생성한
  결과를 그대로 재사용한다(core/cache의 stale-while-revalidate). 단일 인스턴스 전역 캐시라
  그 시간 동안 어느 클라이언트가 호출해도 같은 첫 답변을 받는다 → 비결정성·비용·레이트리밋 차단.
"""
import os
from datetime import datetime, timezone, timedelta

from app.core.cache import cached
from app.schemas.report import ReportResult
from app.services import market_service, analysis_service

_KST = timezone(timedelta(hours=9))

# 리포트 캐시 주기 — 종류별 '데이터 반감기'에 맞춰 차등(LLM 비결정성·비용 차단).
# 이 기간 내 재호출은 LLM을 다시 부르지 않고 처음 생성한 결과를 그대로 반환(전역 캐시).
# - market: 장중 변동(상승/하락·거래량 급증) 의존 → 2시간
# - portfolio·risk: 일 단위 지표(변동성·베타·1개월수익률) 의존 → 6시간
_TTL_BY_TYPE = {"market": 7200, "portfolio": 21600, "risk": 21600}
_TTL_DEFAULT = 10800  # 3시간

# Gemini 모델 — 리포트 생성은 비용/속도 균형상 flash 계열. 필요 시 pro로 교체.
_MODEL = "gemini-2.5-flash"

REPORT_TYPES = {
    "market":    "시장 개관 리포트",
    "portfolio": "포트폴리오 전략 리포트",
    "risk":      "리스크 진단 리포트",
}

# LLM 역할·형식·제약. 할루시네이션 방지(데이터에 없는 수치 금지) + 표준 리서치 5섹션 강제.
_SYSTEM_PROMPT = """당신은 한국 투자자를 위한 암호화폐 퀀트 리서치 애널리스트입니다.
아래 원칙을 반드시 지켜 전문 투자 리서치 리포트를 작성합니다.

[형식] 다음 5개 섹션의 마크다운 문서로 작성합니다:
1. ## 핵심 요약 (Executive Summary) — 결론부터 3~5개 불릿
2. ## 시장 개관 — 제공된 시장 지표 해석
3. ## 주요 관찰 · 시그널 — 데이터에서 읽히는 기회/위험 신호
4. ## 리스크 — 하방 위험과 주의점
5. ## 전략 제언 — 구체적이고 실행 가능한 제언(분산·리스크 관리 포함)

[원칙]
- 제공된 데이터에 있는 수치만 사용합니다. 데이터에 없는 가격·수치·뉴스를 지어내지 마세요.
- 과장·단정·확정적 예측을 피하고 확률·시나리오 언어로 표현합니다.
- 추세추종·평균회귀·분산투자 등 정량 전략 관점을 활용하되 한계(생존편향·거래비용·과최적화)를 함께 언급합니다.
- 맨 끝에 "본 리포트는 정보 제공 목적이며 투자 권유가 아닙니다."를 반드시 명시합니다.
- 한국어로, 간결하고 전문적인 톤으로 작성합니다."""

_TYPE_INSTRUCTION = {
    "market": "이번 리포트는 **시장 개관**에 집중합니다. 전체 시장의 방향성·자금 흐름·시장 폭(상승/하락 분포)을 중심으로 해석하세요.",
    "portfolio": "이번 리포트는 **포트폴리오 전략**에 집중합니다. 어떤 성격의 종목을 어떻게 분산할지, 모멘텀/저변동/베타 관점에서 구체적 비중 아이디어를 제시하세요.",
    "risk": "이번 리포트는 **리스크 진단**에 집중합니다. 변동성·하방 위험·과열 신호·집중 위험을 중심으로 경고와 방어 전략을 제시하세요.",
}


def _fmt_won(v: float) -> str:
    return f"{v:,.0f}원"


def _collect_context() -> dict:
    """프롬프트에 넣을 시장 데이터 묶음 — 전부 프리페치된 캐시(tickers·coin_stats) 재사용(추가 호출 0)."""
    tickers = market_service.get_tickers()
    stats = analysis_service.get_coin_stats()

    total_vol = sum(t.acc_trade_price_24h for t in tickers)
    rise = sum(1 for t in tickers if t.change == "RISE")
    fall = sum(1 for t in tickers if t.change == "FALL")
    btc = next((t for t in tickers if t.market == "KRW-BTC"), None)
    btc_dom = round(btc.acc_trade_price_24h / total_vol * 100, 1) if (btc and total_vol) else 0.0

    by_change = sorted(tickers, key=lambda t: t.change_rate, reverse=True)
    gainers = [(t.korean_name, round(t.change_rate * 100, 2)) for t in by_change[:5]]
    losers = [(t.korean_name, round(t.change_rate * 100, 2)) for t in by_change[-5:]]

    by_mom = sorted(stats, key=lambda s: s.return_1m, reverse=True)[:5]
    momentum = [(s.korean_name, round(s.return_1m, 1), round(s.volatility, 1)) for s in by_mom]
    by_vol = sorted(stats, key=lambda s: s.volatility, reverse=True)[:5]
    volatile = [(s.korean_name, round(s.volatility, 1)) for s in by_vol]
    high_beta = sorted(stats, key=lambda s: s.btc_beta, reverse=True)[:5]
    beta = [(s.korean_name, round(s.btc_beta, 2)) for s in high_beta]
    surge = [(s.korean_name, round(s.vol_surge, 1)) for s in sorted(stats, key=lambda s: s.vol_surge, reverse=True)[:5] if s.vol_surge >= 3]
    w52_high = sum(1 for t in tickers if t.is_52w_high)
    w52_low = sum(1 for t in tickers if t.is_52w_low)

    return {
        "as_of": datetime.now(_KST).strftime("%Y-%m-%d %H:%M KST"),
        "universe": len(tickers),
        "total_volume": total_vol,
        "btc_dominance": btc_dom,
        "rise": rise, "fall": fall,
        "gainers": gainers, "losers": losers,
        "momentum": momentum, "volatile": volatile, "beta": beta, "surge": surge,
        "w52_high": w52_high, "w52_low": w52_low,
    }


def _build_user_prompt(report_type: str, c: dict) -> str:
    """LLM에 보낼 user 메시지 — 수집한 데이터를 구조화 텍스트로. (모델이 이 데이터만 근거로 작성)"""
    lines = [
        _TYPE_INSTRUCTION.get(report_type, _TYPE_INSTRUCTION["market"]),
        "",
        f"# 시장 데이터 ({c['as_of']})",
        f"- 분석 유니버스: {c['universe']}종 (업비트 KRW 마켓)",
        f"- 24h 총 거래대금: {_fmt_won(c['total_volume'])}",
        f"- BTC 거래대금 비중(지배력): {c['btc_dominance']}%",
        f"- 시장 폭: 상승 {c['rise']}종 / 하락 {c['fall']}종",
        f"- 52주 신고가 경신 {c['w52_high']}종 / 신저가 경신 {c['w52_low']}종",
        "",
        "## 상승률 상위: " + ", ".join(f"{n} {r:+.2f}%" for n, r in c["gainers"]),
        "## 하락률 상위: " + ", ".join(f"{n} {r:+.2f}%" for n, r in c["losers"]),
        "## 1개월 모멘텀 상위(수익률%, 변동성%): " + ", ".join(f"{n} {ret:+.1f}%/{vol:.1f}%" for n, ret, vol in c["momentum"]),
        "## 고변동성(일변동성%): " + ", ".join(f"{n} {v:.1f}%" for n, v in c["volatile"]),
        "## 고베타(BTC 민감도): " + ", ".join(f"{n} {b:.2f}" for n, b in c["beta"]),
        "## 거래량 급증(7일평균 대비 배수): " + (", ".join(f"{n} {s:.1f}배" for n, s in c["surge"]) or "없음"),
        "",
        f"위 데이터만 근거로 '{REPORT_TYPES.get(report_type, '시장')}' 리포트를 작성하세요.",
    ]
    return "\n".join(lines)


def _stub_markdown(report_type: str, c: dict) -> str:
    """LLM 미연동 시 모달이 동작하도록 데이터 기반 자동 초안. (키 연결 시 Gemini가 정식 작성)"""
    title = REPORT_TYPES.get(report_type, "시장 개관 리포트")
    g = ", ".join(f"{n}({r:+.2f}%)" for n, r in c["gainers"][:3])
    l = ", ".join(f"{n}({r:+.2f}%)" for n, r in c["losers"][:3])
    mom = ", ".join(f"{n}({ret:+.1f}%)" for n, ret, _ in c["momentum"][:3])
    breadth = "상승 우위" if c["rise"] > c["fall"] else "하락 우위" if c["fall"] > c["rise"] else "중립"
    return f"""> ⚠️ **LLM 미연동 상태** — 아래는 데이터 기반 자동 초안입니다. `GEMINI_API_KEY`를 연결하면 Gemini가 정식 리포트를 작성합니다.

# {title}
*{c['as_of']} · 업비트 KRW {c['universe']}종 기준*

## 핵심 요약
- 시장 폭은 **{breadth}** (상승 {c['rise']}종 / 하락 {c['fall']}종)
- 24h 총 거래대금 {_fmt_won(c['total_volume'])}, BTC 지배력 {c['btc_dominance']}%
- 1개월 모멘텀 강세: {mom}
- 52주 신고가 {c['w52_high']}종 / 신저가 {c['w52_low']}종

## 시장 개관
오늘 시장은 거래대금 {_fmt_won(c['total_volume'])} 규모에서 {breadth} 흐름을 보이고 있습니다.
상승률 상위는 {g}, 하락률 상위는 {l} 입니다.

## 주요 관찰 · 시그널
- 모멘텀 상위 종목({mom})은 추세추종 관점의 후보이나, 급반전(모멘텀 크래시) 위험을 함께 봐야 합니다.
- 거래량 급증 종목: {", ".join(f"{n}" for n, _ in c["surge"]) or "특이 없음"}.

## 리스크
- 고변동성 종목: {", ".join(f"{n}" for n, _ in c["volatile"][:3])} — 변동성 대비 비중 축소 검토.
- 모든 수치는 과거·현재 데이터 기반이며 생존편향·거래비용·미래 불확실성을 내포합니다.

## 전략 제언
- 추세가 살아있는 모멘텀 상위에서 **변동성 역가중**으로 분산하고, 단일 종목 집중을 피합니다.
- 시장 폭이 약해지면(소수 종목 주도) 익스포저를 줄이고 현금 비중을 높입니다.

---
*본 리포트는 정보 제공 목적이며 투자 권유가 아닙니다.*
"""


def _generate(report_type: str) -> ReportResult:
    if report_type not in REPORT_TYPES:
        report_type = "market"
    c = _collect_context()
    system = _SYSTEM_PROMPT            # noqa: F841 — LLM 연결 시 사용
    user = _build_user_prompt(report_type, c)  # noqa: F841 — LLM 연결 시 사용
    generated_at = int(datetime.now(timezone.utc).timestamp())

    # ── LLM 호출 (Gemini) — 주석 처리. GEMINI_API_KEY 설정 후 이 블록을 활성화하면 동작 ──
    # from google import genai
    # from google.genai import types
    # client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    # resp = client.models.generate_content(
    #     model=_MODEL,
    #     contents=user,
    #     config=types.GenerateContentConfig(
    #         system_instruction=system,
    #         temperature=0.4,          # 리포트는 사실 기반 → 낮은 온도
    #         max_output_tokens=2048,
    #     ),
    # )
    # markdown = resp.text
    # return ReportResult(report_type=report_type, title=REPORT_TYPES[report_type],
    #                     markdown=markdown, model=_MODEL, generated_at=generated_at,
    #                     enabled=True)

    # 미연동 — 데이터 기반 자동 초안 반환(모달 동작 확인용).
    return ReportResult(
        report_type=report_type, title=REPORT_TYPES[report_type],
        markdown=_stub_markdown(report_type, c), model=_MODEL,
        generated_at=generated_at, enabled=False,
        note="LLM 미연동 — GEMINI_API_KEY 연결 시 Gemini가 작성합니다.",
    )


def generate_report(report_type: str) -> ReportResult:
    """리포트 생성 — 종류별 차등 캐시(market 2h / portfolio·risk 6h). LLM은 호출마다 답이
    달라질 수 있어, 이 기간 내 재호출은 처음 생성한 결과를 그대로 반환한다(전역 캐시라 모든
    클라이언트가 같은 첫 답변을 받음)."""
    rt = report_type if report_type in REPORT_TYPES else "market"
    ttl = _TTL_BY_TYPE.get(rt, _TTL_DEFAULT)
    return cached(f"report:{rt}", ttl, lambda: _generate(rt))
