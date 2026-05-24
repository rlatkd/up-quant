from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "UPquant"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()

# ── 분석 대상 마켓 + 카테고리 ────────────────────────────────
# Upbit는 카테고리를 제공하지 않으므로 수동 매핑. 실제 상장 여부는 /market/all로 필터링한다.
MARKET_CATEGORIES: dict[str, str] = {
    "KRW-BTC":   "layer1",
    "KRW-ETH":   "layer1",
    "KRW-SOL":   "layer1",
    "KRW-AVAX":  "layer1",
    "KRW-DOT":   "layer1",
    "KRW-ATOM":  "layer1",
    "KRW-NEAR":  "layer1",
    "KRW-ADA":   "layer1",
    "KRW-XRP":   "layer1",
    "KRW-LINK":  "defi",
    "KRW-1INCH": "defi",
    "KRW-DOGE":  "meme",
    "KRW-SAND":  "gaming",
    "KRW-MANA":  "gaming",
    "KRW-POL":   "layer2",
}

MARKETS: list[str] = list(MARKET_CATEGORIES.keys())

# 분석 유니버스: True면 업비트 KRW 마켓 전체, False면 위 MARKET_CATEGORIES 15종목만.
# (전체 사용 시 카테고리 미매핑 코인이 생기며, 카테고리 기반 화면은 추후 분류 소스 확정 시 처리)
USE_ALL_KRW_MARKETS = True

# ── 캐시 TTL (초) ───────────────────────────────────────────
TTL_MARKET_ALL = 3600   # 마켓 목록/한글명 (거의 안 변함)
TTL_TICKER     = 5      # 현재가
TTL_CANDLE     = 30     # 캔들 (분/주/월)
TTL_CANDLE_DAYS = 600   # 일봉 (통계 공용 — 장시간 캐시로 전체 유니버스 부하 억제)
TTL_SPARKLINE  = 300    # 코인목록 1일 스파크라인 (1시간봉 24개)
TTL_ORDERBOOK  = 3      # 호가
TTL_TRADES     = 3      # 체결
