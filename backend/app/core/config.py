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
TTL_CANDLE     = 30     # 캔들 (분/주/월)
TTL_CANDLE_DAYS = 600   # 일봉 (통계 공용 — 장시간 캐시로 전체 유니버스 부하 억제)
TTL_COIN_STATS = 300    # 코인 통계(변동성·수익률·베타·z-score) — 일봉 파생이라 거의 안 변함. 261종 루프 비싸서 길게.
TTL_SPARKLINE  = 300    # 코인목록 1일 스파크라인 (1시간봉 24개)
TTL_ORDERBOOK  = 3      # 호가
TTL_TRADES     = 3      # 체결
TTL_CATEGORY   = 1800   # 카테고리 월별/누적 수익률 (월봉 261종 집계 — 콜드 비용 커서 장기 캐시)
