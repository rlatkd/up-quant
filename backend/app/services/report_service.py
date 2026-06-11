"""LLM 투자 전략 리포트 — 부문(시장 개관·포트폴리오 전략·리스크 진단)별 **전용 프롬프트**로 Google
Gemini에 요청하고, 부문별로 지정한 마크다운 섹션 구조로 응답을 받아 그대로 반환한다.

규칙:
- LLM = Google Gemini. 응답은 부문별 출력 형식(아래 _SPECS)에 맞춰 받고, **LLM 응답만** 그대로 보여준다.
- 키(GEMINI_API_KEY) 미설정·호출 실패·빈 응답이면 **숨기지 않고 오류를 전파**한다(자동 초안/폴백 없음 →
  라우터가 502로 변환해 프론트에 오류를 노출). 실패는 캐시하지 않는다(예외는 cached가 저장하지 않음).
- 종류별 차등 캐시: 같은 종류는 일정 시간 동안 처음 생성한 결과를 그대로 재사용(전역 캐시) →
  LLM 비결정성·비용·레이트리밋 차단.
"""
import logging
from datetime import datetime, timezone, timedelta

from app.core.cache import cached
from app.core.config import settings
from app.schemas.report import ReportResult
from app.services import market_service, analysis_service

logger = logging.getLogger(__name__)
_KST = timezone(timedelta(hours=9))

# 리포트 캐시 주기 — 종류별 '데이터 반감기'에 맞춰 차등(LLM 비결정성·비용 차단).
_TTL_BY_TYPE = {"market": 7200, "portfolio": 21600, "risk": 21600}
_TTL_DEFAULT = 10800  # 3시간

# Gemini 모델 — 리포트는 비용/속도 균형상 flash. (2.0-flash 폴백은 이 키 무료티어에서 429 쿼터라 무용 → 제외)
_MODELS = ["gemini-2.5-flash"]
# 일시적 오류(짧은 재시도가 의미 있는) — 서버 과부하만. 429 쿼터초과는 즉시 재시도해도 안 풀려 제외.
_TRANSIENT = ("503", "unavailable", "overloaded")

REPORT_TYPES = {
    "market":    "시장 개관 리포트",
    "portfolio": "포트폴리오 전략 리포트",
    "risk":      "리스크 진단 리포트",
}

# 공통 역할·원칙 (system_instruction) — 할루시네이션 방지 + 형식 엄수.
_ROLE = """당신은 한국 투자자를 위한 암호화폐 퀀트 리서치 애널리스트입니다.
[원칙]
- 제공된 데이터에 있는 수치만 사용합니다. 데이터에 없는 가격·수치·뉴스를 지어내지 마세요.
- 과장·단정·확정적 예측을 피하고 확률·시나리오 언어로 표현합니다.
- 정량 전략(추세추종·평균회귀·분산투자) 관점을 활용하되 한계(생존편향·거래비용·과최적화)를 함께 언급합니다.
- 한국어로, 간결하고 전문적인 톤으로 작성합니다.
- 지시한 마크다운 섹션 구조를 **정확히** 지키고(섹션 제목·순서 그대로), 그 외 머리말·맺음말·코드블록·표는 넣지 않습니다.
- 맨 끝에 '> 본 리포트는 정보 제공 목적이며 투자 권유가 아닙니다.' 한 줄을 인용문(>)으로 넣습니다."""

# 부문별 초점 + 출력 형식 — LLM은 정확히 이 섹션 구조로만 응답한다.
_SPECS = {
    "market": {
        "focus": "전체 시장의 방향성·자금 흐름·시장 폭(상승/하락 분포)을 중심으로 해석합니다.",
        "format": """## 핵심 요약
- (결론부터 3~5개 불릿)

## 시장 방향성
(거래대금·등락 분포·지배력으로 본 전반 흐름)

## 자금 흐름 · 시장 폭
(상승/하락 종목 수, 거래량 급증, 52주 신고/신저로 본 폭)

## 주의 신호
(과열·쏠림·하방 위험)

## 결론 · 대응
(시나리오별 대응)""",
    },
    "portfolio": {
        "focus": "어떤 성격의 종목을 어떻게 분산할지, 모멘텀·저변동·베타 관점에서 구체적 구성 아이디어를 제시합니다.",
        "format": """## 핵심 요약
- (결론부터 3~5개 불릿)

## 추천 구성 방향
(모멘텀/저변동/베타 축으로 본 바스켓 성격)

## 종목 후보
(모멘텀 상위·저변동·고베타 데이터를 근거로 한 후보군과 이유)

## 분산 · 리스크 관리
(상관·변동성 역가중·집중 회피)

## 결론 · 실행
(구체적 비중 아이디어와 점검 포인트)""",
    },
    "risk": {
        "focus": "변동성·하방 위험·과열 신호·집중 위험을 중심으로 경고와 방어 전략을 제시합니다.",
        "format": """## 핵심 요약
- (결론부터 3~5개 불릿)

## 변동성 진단
(고변동 종목군·시장 변동성 수준)

## 하방 · 꼬리 위험
(급락·52주 신저·고베타의 하방 민감도)

## 집중 · 과열 신호
(거래량 급증·쏠림)

## 방어 전략
(익스포저 축소·헤지·현금 비중)""",
    },
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


def _data_block(c: dict) -> str:
    """수집한 데이터를 구조화 텍스트로(모델이 이 데이터만 근거로 작성)."""
    return "\n".join([
        f"- 분석 유니버스: {c['universe']}종 (업비트 KRW 마켓)",
        f"- 24h 총 거래대금: {_fmt_won(c['total_volume'])}",
        f"- BTC 거래대금 비중(지배력): {c['btc_dominance']}%",
        f"- 시장 폭: 상승 {c['rise']}종 / 하락 {c['fall']}종",
        f"- 52주 신고가 경신 {c['w52_high']}종 / 신저가 경신 {c['w52_low']}종",
        "- 상승률 상위: " + ", ".join(f"{n} {r:+.2f}%" for n, r in c["gainers"]),
        "- 하락률 상위: " + ", ".join(f"{n} {r:+.2f}%" for n, r in c["losers"]),
        "- 1개월 모멘텀 상위(수익률%, 변동성%): " + ", ".join(f"{n} {ret:+.1f}%/{vol:.1f}%" for n, ret, vol in c["momentum"]),
        "- 고변동성(일변동성%): " + ", ".join(f"{n} {v:.1f}%" for n, v in c["volatile"]),
        "- 고베타(BTC 민감도): " + ", ".join(f"{n} {b:.2f}" for n, b in c["beta"]),
        "- 거래량 급증(7일평균 대비 배수): " + (", ".join(f"{n} {s:.1f}배" for n, s in c["surge"]) or "없음"),
    ])


def _build_prompt(report_type: str, c: dict) -> str:
    """부문별 전용 프롬프트 — 초점 + 출력 형식(섹션 구조) + 데이터."""
    spec = _SPECS[report_type]
    return (
        f"[이번 리포트] {REPORT_TYPES[report_type]} — {spec['focus']}\n\n"
        f"[출력 형식] 아래 마크다운 섹션 구조를 **정확히** 지켜 작성하세요(섹션 제목 그대로, 순서 그대로):\n"
        f"{spec['format']}\n\n"
        f"[시장 데이터 ({c['as_of']})]\n{_data_block(c)}\n\n"
        f"위 데이터에 있는 수치만 근거로 작성하세요."
    )


def _generate(report_type: str) -> ReportResult:
    if report_type not in REPORT_TYPES:
        report_type = "market"
    key = settings.gemini_api_key
    if not key:
        # 자동 초안 없음 — 키가 없으면 명확히 실패시킨다(라우터가 502로 노출).
        raise RuntimeError("GEMINI_API_KEY가 설정되지 않았습니다 (backend/.env). 리포트를 생성할 수 없습니다.")

    c = _collect_context()
    prompt = _build_prompt(report_type, c)
    generated_at = int(datetime.now(timezone.utc).timestamp())

    import time
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=key)

    def _cfg(model: str):
        kw = dict(system_instruction=_ROLE, temperature=0.4, max_output_tokens=4096)
        if model.startswith("gemini-2.5"):
            # 2.5-flash는 thinking 토큰이 max_output_tokens 예산을 잠식 → 리포트가 잘림. thinking 끔.
            kw["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
        return types.GenerateContentConfig(**kw)

    # 503(과부하)·429 등 일시 오류는 모델별 3회 백오프 재시도 후, 다음 폴백 모델로. 비일시적 오류는 즉시 전파.
    last_err: object = "알 수 없는 오류"
    for model in _MODELS:
        for attempt in range(3):
            try:
                resp = client.models.generate_content(model=model, contents=prompt, config=_cfg(model))
                markdown = (resp.text or "").strip()
                if markdown:
                    return ReportResult(
                        report_type=report_type, title=REPORT_TYPES[report_type],
                        markdown=markdown, model=model, generated_at=generated_at, enabled=True,
                    )
                last_err = "빈 응답"
            except Exception as e:  # noqa: BLE001
                last_err = e
                if not any(t in str(e).lower() for t in _TRANSIENT):
                    logger.warning("Gemini 비일시적 오류(%s/%s): %s", report_type, model, e)
                    raise RuntimeError(f"Gemini 호출 실패: {e}") from e
                logger.info("Gemini 일시 오류 재시도(%s/%s 시도 %d): %s", report_type, model, attempt + 1, e)
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Gemini가 과부하 상태입니다(재시도 소진) — 잠시 후 다시 시도하세요. ({last_err})")


def generate_report(report_type: str) -> ReportResult:
    """리포트 생성 — 종류별 차등 캐시(market 2h / portfolio·risk 6h). 실패는 예외로 전파되며
    cached가 예외를 저장하지 않으므로 캐시되지 않는다(다음 호출에 재시도)."""
    rt = report_type if report_type in REPORT_TYPES else "market"
    ttl = _TTL_BY_TYPE.get(rt, _TTL_DEFAULT)
    return cached(f"report:{rt}", ttl, lambda: _generate(rt))
