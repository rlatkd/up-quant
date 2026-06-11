import { useState, useEffect, useRef } from 'react'
import { WS_BASE } from '../config'
import { wsTicket } from '../api/auth'

// 코인 상세용 — 한 종목의 호가(orderbook)·체결(trade)을 백엔드 WS(/ws/market/:market)로 실시간 수신.
// market이 바뀌면 재연결. 초기엔 비어 있으니 호출부가 REST 값으로 폴백한다.
export function useMarketStream(market: string) {
  const [orderbook, setOrderbook] = useState<any>(null)
  const [trades, setTrades] = useState<any[]>([])
  const seqRef = useRef(0)  // 체결에 고유 키 부여(같은 시각 체결 구분)

  useEffect(() => {
    if (!market) return
    // 종목 전환 시 이전 호가·체결을 즉시 비운다(새 종목 첫 메시지 도착 전 잔상 방지).
    /* eslint-disable react-hooks/set-state-in-effect */
    setOrderbook(null)
    setTrades([])
    /* eslint-enable react-hooks/set-state-in-effect */
    seqRef.current = 0
    let ws: WebSocket | undefined
    let alive = true
    let retry: ReturnType<typeof setTimeout> | undefined

    async function connect() {
      if (!alive) return
      let ticket
      try { ticket = await wsTicket() } catch { if (alive) retry = setTimeout(connect, 3000); return }
      if (!alive) return
      ws = new WebSocket(`${WS_BASE}/ws/market/${market}?token=${encodeURIComponent(ticket)}`)
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          if (d.type === 'orderbook') {
            setOrderbook({ asks: d.asks, bids: d.bids })
          } else if (d.type === 'trade') {
            const id = ++seqRef.current
            setTrades(prev => [{ ...d, _id: id }, ...prev].slice(0, 30))
          }
        } catch { /* 무시 */ }
      }
      ws.onclose = () => { if (alive) retry = setTimeout(connect, 3000) }
      ws.onerror = () => { try { ws!.close() } catch { /* noop */ } }
    }
    connect()

    return () => {
      alive = false
      clearTimeout(retry)
      if (ws) ws.close()
    }
  }, [market])

  return { orderbook, trades }
}
