import client from './client'
import type { CandleItem } from '../types'

// 캔들 — (market, interval, count)를 키에 포함해 인터벌/종목 전환 시 자동 재요청·캐시 재사용.
// keepPreviousData: 코인/인터벌을 바꾸면 새 캔들이 올 때까지 '이전 차트'를 그대로 보여주다
// 도착하면 교체한다(빈 화면/스피너 없이 부드럽게 갱신).
export const getCandles = (market: string, interval = 'days', count = 60): Promise<CandleItem[]> =>
  client.get(`/api/candles/${market}`, { params: { interval, count } }).then(r => r.data)
