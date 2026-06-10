import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getCandles } from '../api/candles'

// 캔들 — (market, interval, count)를 키에 포함해 인터벌/종목 전환 시 자동 재요청·캐시 재사용.
// keepPreviousData: 코인/인터벌을 바꾸면 새 캔들이 올 때까지 '이전 차트'를 그대로 보여주다
// 도착하면 교체한다(빈 화면/스피너 없이 부드럽게 갱신).
export function useCandles(market, interval = 'days', count = 60) {
  const q = useQuery({
    queryKey: ['candles', market, interval, count],
    queryFn: () => getCandles(market, interval, count),
    enabled: !!market,
    placeholderData: keepPreviousData,
  })
  return {
    candles: q.data ?? [],
    // 이전 데이터를 보여주는 동안(placeholder)은 로딩으로 치지 않음 → 차트 스피너 대신 옛 차트 유지
    loading: q.isLoading,
    isFetching: q.isFetching,
    error: q.isError,
    retry: () => { q.refetch() },
  }
}
