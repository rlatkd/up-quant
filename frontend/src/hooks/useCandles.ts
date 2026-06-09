import { useQuery } from '@tanstack/react-query'
import { getCandles } from '../api/candles'

// 캔들 — (market, interval, count)를 키에 포함해 인터벌/종목 전환 시 자동 재요청·캐시 재사용.
// 분봉은 backend TTL이 짧지만, 같은 차트를 다시 열 때 staleTime 내면 즉시 렌더된다.
export function useCandles(market, interval = 'days', count = 60) {
  const q = useQuery({
    queryKey: ['candles', market, interval, count],
    queryFn: () => getCandles(market, interval, count),
    enabled: !!market,
    placeholderData: [],
  })
  return { candles: q.data ?? [], loading: q.isLoading, error: q.isError, retry: () => { q.refetch() } }
}
