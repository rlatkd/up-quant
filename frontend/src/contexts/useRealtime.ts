import { useRef, useEffect, useState, useMemo, useSyncExternalStore } from 'react'
import { subscribeMarket, getPrice, subscribeConnected, getConnected, subscribeAny, getVersion } from './realtimeStore'

// 특정 종목의 실시간 시세 — 그 종목만 구독해, 해당 종목 가격이 바뀔 때만 리렌더한다.
// (없으면 undefined → 호출부가 REST 값으로 폴백)
export function useLivePrice(market: any) {
  return useSyncExternalStore(
    (cb) => (market ? subscribeMarket(market, cb) : () => {}),
    () => (market ? getPrice(market) : undefined),
  )
}

// 전역 실시간 버전 — 아무 종목이나 갱신되면 바뀐다. 리스트 전체를 라이브로 재정렬/집계할 때 구독.
export function useLiveVersion() {
  return useSyncExternalStore(subscribeAny, getVersion)
}

// REST tickers에 실시간 시세(가격·등락·거래대금)를 덮어쓴 배열을 반환. 배치(300ms)마다 재계산되어
// 정렬·필터 카운트·거래대금이 라이브로 갱신된다. (없는 종목은 REST 값 유지)
export function useLiveTickers(tickers: any) {
  const version = useLiveVersion()
  return useMemo(() => tickers.map((t: any) => {
    const live = getPrice(t.market)
    return live ? {
      ...t,
      trade_price: live.trade_price ?? t.trade_price,
      change: live.change ?? t.change,
      change_rate: live.change_rate ?? t.change_rate,
      change_price: live.change_price ?? t.change_price,
      acc_trade_price_24h: live.acc_trade_price_24h ?? t.acc_trade_price_24h,
    } : t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tickers, version])
}

// WS 연결 여부 (헤더 연결 인디케이터용)
export function useWsConnected() {
  return useSyncExternalStore(subscribeConnected, getConnected)
}

// 값이 바뀌는 순간 'up'/'down' 펄스 신호를 잠깐 반환(가격 셀 깜빡임용).
export function usePulse(value: any, ms = 500) {
  const prev = useRef(value)
  const [flash, setFlash] = useState<any>(null)
  useEffect(() => {
    if (prev.current != null && value != null && value !== prev.current) {
      setFlash(value > prev.current ? 'up' : 'down')
      const t = setTimeout(() => setFlash(null), ms)
      prev.current = value
      return () => clearTimeout(t)
    }
    prev.current = value
  }, [value, ms])
  return flash
}
