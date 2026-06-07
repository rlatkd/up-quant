import { useRef, useEffect, useState, useSyncExternalStore } from 'react'
import { subscribeMarket, getPrice, subscribeConnected, getConnected } from './realtimeStore'

// 특정 종목의 실시간 시세 — 그 종목만 구독해, 해당 종목 가격이 바뀔 때만 리렌더한다.
// (없으면 undefined → 호출부가 REST 값으로 폴백)
export function useLivePrice(market) {
  return useSyncExternalStore(
    (cb) => (market ? subscribeMarket(market, cb) : () => {}),
    () => (market ? getPrice(market) : undefined),
  )
}

// WS 연결 여부 (헤더 연결 인디케이터용)
export function useWsConnected() {
  return useSyncExternalStore(subscribeConnected, getConnected)
}

// 값이 바뀌는 순간 'up'/'down' 펄스 신호를 잠깐 반환(가격 셀 깜빡임용).
export function usePulse(value, ms = 500) {
  const prev = useRef(value)
  const [flash, setFlash] = useState(null)
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
