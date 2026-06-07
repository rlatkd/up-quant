import { useLivePrice, usePulse } from '../contexts/useRealtime'

// 실시간 가격/등락 셀 — WS 시세가 있으면 그 값, 없으면 REST 폴백. 가격 변동 순간 펄스(빨강/파랑).
// 코인목록·대시보드 시세표·마켓 순위 등에서 공용으로 쓴다.
const changeColor = (ch) => (ch === 'RISE' ? 'text-red-500' : ch === 'FALL' ? 'text-blue-500' : 'text-gray-600 dark:text-gray-300')

export function LivePrice({ ticker, className = '' }) {
  const live = useLivePrice(ticker.market)
  const price = live?.trade_price ?? ticker.trade_price
  const change = live?.change ?? ticker.change
  const flash = usePulse(price)
  // px-1은 flash와 무관하게 항상 적용(폭 고정 → 펄스 시 테이블 reflow 방지). 펄스는 배경만 바뀐다.
  return (
    <span className={`tabular-nums font-medium rounded px-1 ${changeColor(change)} ${flash ? `flash-${flash}` : ''} ${className}`}>
      {price.toLocaleString()}
    </span>
  )
}

export function LiveChangeRate({ ticker, className = '' }) {
  const live = useLivePrice(ticker.market)
  const rate = live?.change_rate ?? ticker.change_rate
  const change = live?.change ?? ticker.change
  return (
    <span className={`tabular-nums ${changeColor(change)} ${className}`}>
      {(rate > 0 ? '+' : '')}{(rate * 100).toFixed(2)}%
    </span>
  )
}
