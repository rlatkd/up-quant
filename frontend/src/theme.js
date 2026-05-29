// 방향성 없는 "구분용" 시리즈 색 팔레트 (카테고리/비교/백테스트 공용).
// 업비트 톤: 차분·절제. 기존에 흩어져 튀던 indigo/emerald/violet 대신 통일된 한 세트.
// ⚠️ 의미색(상승 빨강 #ef4444 / 하락 파랑 #3b82f6)과 헷갈리지 않도록 순수 red/blue는 제외.
export const SERIES = [
  '#1763b6', // 브랜드 블루
  '#0e9594', // teal
  '#c2792b', // amber(차분)
  '#7b5ea7', // muted violet
  '#5b7186', // slate
  '#b5495b', // muted rose
  '#2f8f5b', // muted green
]

export const seriesColor = (i) => SERIES[i % SERIES.length]

// 시장 지배력 도넛 — 부분-전체 비중이라 브랜드 블루 단일 농담 + '기타'는 회색.
// (여러 색을 쓰기보다 한 색의 농담으로 가는 게 가장 업비트다운 처리)
export const DOM_COLORS = ['#1763b6', '#4a8fd1', '#8ab4e1', '#c2d8ef', '#cbd5e1']
