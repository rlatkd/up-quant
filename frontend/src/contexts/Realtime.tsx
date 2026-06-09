import { useEffect, useRef } from 'react'
import { applyTickers, setConnected } from './realtimeStore'
import { WS_BASE } from '../config'

// 실시간 시세 Provider — 백엔드 WS(/ws/tickers, 업비트 중계)에 연결해 외부 store에 반영한다.
// 시세 구독은 store의 종목별 selector(useLivePrice)가 맡으므로, 여기선 WS 생명주기만 관리(렌더 없음).
// WS는 가격 변동마다 푸시(261종)되므로 메시지를 버퍼에 모아 300ms 배치로 store에 반영(리렌더 폭주 방지).
export function RealtimeProvider({ children }) {
  const bufferRef = useRef({})

  useEffect(() => {
    let ws
    let alive = true
    let retry

    function connect() {
      // WS 베이스는 config(WS_BASE)에서 — 로컬은 ws://localhost:8000, 배포는 VITE_WS_BASE.
      ws = new WebSocket(`${WS_BASE}/ws/tickers`)
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          bufferRef.current[d.market] = d
        } catch { /* 무시 */ }
      }
      ws.onclose = () => { setConnected(false); if (alive) retry = setTimeout(connect, 3000) }
      ws.onerror = () => { try { ws.close() } catch { /* noop */ } }
    }
    connect()

    const flush = setInterval(() => {
      if (Object.keys(bufferRef.current).length) {
        applyTickers(bufferRef.current)
        bufferRef.current = {}
      }
    }, 300)

    return () => {
      alive = false
      clearInterval(flush)
      clearTimeout(retry)
      if (ws) ws.close()
    }
  }, [])

  return children
}
