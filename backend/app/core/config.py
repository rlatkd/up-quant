import json
from collections import Counter
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    app_name: str = "UPquant"
    # 허용할 프론트 오리진. 배포 시 환경변수 CORS_ORIGINS(콤마 구분)로 덮어쓴다.
    # 예: CORS_ORIGINS="https://upquant.app,https://www.upquant.app"
    # NoDecode: pydantic-settings가 list 타입을 JSON으로 먼저 파싱하지 않게 하여(아래 validator가
    # 콤마 구분 문자열을 직접 처리하도록), 환경변수에 그냥 CSV를 넣을 수 있게 한다.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # 부팅 프리페치(대량 워밍) 건너뛰기 — dev 리로드마다 1~2분 대기를 피하려면 1로 설정.
    skip_prefetch: bool = False

    # ── 인증/보안 ──────────────────────────────────────────────
    # JWT 서명 시크릿. 배포 시 반드시 AUTH_SECRET 환경변수로 강한 랜덤값을 주입(아래 기본값은 dev 전용).
    auth_secret: str = "dev-insecure-change-me-please-set-AUTH_SECRET"
    auth_access_ttl_min: int = 30        # access 토큰 만료(분)
    auth_refresh_ttl_min: int = 60 * 24 * 7  # refresh 토큰 만료(7일)
    # 하드코딩 단일 계정(대학원 과제용 — 학생/교수만 접근). 비번은 bcrypt 해시로 검증.
    auth_username: str = "test"
    auth_password: str = "test"
    # 쿠키 Secure 플래그 — 배포(HTTPS)에선 True, 로컬 http dev에선 False.
    cookie_secure: bool = False
    # 전역 인바운드 레이트리밋(IP당) — 해킹/봇 요청 폭주로 AWS 비용이 새는 것을 앱 레벨에서 1차 차단.
    rate_limit_per_min: int = 240        # IP당 분당 허용 요청(버스트 허용, 초과 시 429)
    login_max_attempts: int = 5          # 로그인 실패 허용 횟수(윈도우 내)
    login_window_sec: int = 300          # 로그인 실패 카운트 윈도우(초)
    login_lock_sec: int = 600            # 초과 시 잠금(초)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, v):
        # 환경변수는 문자열로 들어오므로 콤마 구분을 리스트로 변환(JSON 리스트 표기도 허용).
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)  # JSON 리스트 표기 직접 파싱
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


settings = Settings()

# ── 업비트 코인 분류(섹터) ──────────────────────────────────
# Upbit 시세 Open API(api.upbit.com)는 카테고리를 제공하지 않는다. 대신 업비트 데이터랩의
# '코인 분류'(datalab.upbit.com/sector)를 1회 스크랩한 정적 스냅샷(app/data/upbit_sectors.json)을
# 분류 소스로 쓴다. 실제 상장 여부는 부팅 시 /market/all과 교집합으로 필터링한다.
_SECTORS_PATH = Path(__file__).resolve().parent.parent / "data" / "upbit_sectors.json"
with open(_SECTORS_PATH, encoding="utf-8") as _f:
    _SECTORS = json.load(_f)

# market → 대분류(level1) 섹터. 카테고리 화면의 기준 분류.
MARKET_CATEGORIES: dict[str, str] = {m: c["level1"] for m, c in _SECTORS["coins"].items()}
# market → {level1, level2, level3} 세부 분류 (필요 시 사용).
MARKET_SUBCATEGORIES: dict[str, dict] = _SECTORS["coins"]
# 카테고리 목록 — 소속 종목 수 내림차순(화면 표시 순서). 예: 스마트 컨트랙트 플랫폼·인프라·…
CATEGORY_LIST: list[str] = [c for c, _ in Counter(MARKET_CATEGORIES.values()).most_common()]

MARKETS: list[str] = list(MARKET_CATEGORIES.keys())

# 분석 유니버스: True면 업비트 KRW 마켓 전체, False면 MARKET_CATEGORIES에 있는 종목만.
USE_ALL_KRW_MARKETS = True

# ── 캐시 TTL (초) ───────────────────────────────────────────
TTL_MARKET_ALL = 3600   # 마켓 목록/한글명 (거의 안 변함)
TTL_TICKER     = 5      # 현재가
TTL_CANDLE     = 30     # 짧은 분봉(1/3/5/15/30분) — 라이브 차트라 짧게(WS가 최신가 덧씌움)
# 60분·240분봉은 시간 단위로만 갱신되는데 과거엔 30초 TTL이라, 대시보드 인트라데이 지수가
# 재계산될 때마다 수십 종 60분봉을 콜드로 다시 받는 숨은 팬아웃이 있었다 → 수 분 TTL로 완화.
TTL_CANDLE_INTRADAY = 300  # 60분/240분봉 (인트라데이 지수·라이브 차트 공용, WS가 최신가 덧씌움)
# 일봉은 하루에 한 번만 확정된다(장중엔 당일 마지막 봉만 갱신, 그건 WS 라이브가 담당). 과거 600초는
# 과하게 짧아 30분~수십분마다 261종 일봉 재검증 팬아웃이 백그라운드로 돌았다 → 1시간으로 늘려 빈도 급감.
TTL_CANDLE_DAYS = 3600  # 일봉 (통계 공용 — 1시간, 장중 거의 안 변함)
# 주봉·월봉 — 장중 거의 안 변하는데도 과거엔 분봉과 같은 30s라, 이를 소비하는 집계(기간수익률 TTL 300·
# 섹터 월봉 TTL 1800)가 재검증될 때마다 261종 월봉을 콜드로 다시 받았다(숨은 팬아웃). 일봉처럼 canonical
# 캐시 + 장기 TTL로 맞춰, 집계 재검증이 하위 캔들을 콜드로 다시 받지 않게 한다.
TTL_CANDLE_LONG = 1800  # 주봉/월봉 (집계 공용)
TTL_COIN_STATS = 300    # 코인 통계(변동성·수익률·베타·z-score) — 일봉 파생이라 거의 안 변함. 261종 루프 비싸서 길게.
# 스파크라인은 1시간봉이라 1시간에 한 번만 의미있게 바뀜 → 5분은 과하게 짧음(전체 종목 프리페치 시
# 5분마다 261종 재페치 부담). 30분으로 늘려 백그라운드 재페치 빈도를 낮춘다.
TTL_SPARKLINE  = 1800   # 코인목록 1일 스파크라인 (1시간봉 24개 — 30분)
TTL_ORDERBOOK  = 3      # 호가
TTL_TRADES     = 3      # 체결
TTL_CATEGORY   = 1800   # 카테고리 월별/누적 수익률 (월봉 261종 집계 — 콜드 비용 커서 장기 캐시)
