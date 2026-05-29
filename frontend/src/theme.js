// 방향성 없는 "구분용" 시리즈 색 팔레트 (카테고리/비교/백테스트 공용).
// 업비트 톤: 차분·절제. 기존에 흩어져 튀던 indigo/emerald/violet 대신 통일된 한 세트.
// ⚠️ 의미색(상승 빨강 #ef4444 / 하락 파랑 #3b82f6)과 헷갈리지 않도록 순수 red/blue는 제외.
export const SERIES = [
  '#4c8dd6', // 블루(밝게)
  '#27b3ab', // teal
  '#e0913c', // amber
  '#9b7fc7', // violet
  '#7d93a8', // slate
  '#d56e83', // rose
  '#4cae76', // green
]

export const seriesColor = (i) => SERIES[i % SERIES.length]

// 시장 지배력 도넛 — BTC·ETH·XRP·SOL·기타. 비중 비교라 조각 구분이 우선이므로
// 단일 블루 농담 대신 색상(hue)을 분리(차분 톤 유지, 의미색 순수 red/blue는 회피). '기타'는 회색.
export const DOM_COLORS = ['#4c8dd6', '#27b3ab', '#e0913c', '#9b7fc7', '#d1d5db']
