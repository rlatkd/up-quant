import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { getCategoryMonthly, getCategoryDailyCumulative, getCoinStats, getCorrelation, getAdvanceDecline } from '../api/analysis'
import { useFetch } from './useFetch'

const EMPTY_RETURNS = { categories: [], rows: [] }

// Advance-Decline 라인 (시장 폭의 추세). 파라미터 없음 — 거래대금 상위 100종 단일 뷰.
export function useAdvanceDecline() {
  return useFetch(['analysis', 'advance-decline'], getAdvanceDecline, { points: [], n: 0, n_obs: 0 })
}

// 섹터 일봉 동일가중 누적수익률 (최근 ~200일). 파라미터 없음 — 단일 일봉 뷰.
export function useCategoryDailyCumulative() {
  return useFetch(['analysis', 'category-daily-cumulative'], getCategoryDailyCumulative, EMPTY_RETURNS)
}

export function useCategoryMonthly() {
  return useFetch(['analysis', 'category-monthly'], getCategoryMonthly, EMPTY_RETURNS)
}

export function useCoinStats() {
  return useFetch(['analysis', 'coin-stats'], getCoinStats, [])
}

// 종목별 상관관계 — market을 키에 포함해 종목 전환 시 자동 재요청·캐시. keepPreviousData로 전환 시 옛 값 유지.
export function useCorrelation(market) {
  const q = useQuery({
    queryKey: ['analysis', 'correlation', market],
    queryFn: () => getCorrelation(market),
    enabled: !!market,
    placeholderData: keepPreviousData,
  })
  return { data: q.data ?? [], loading: q.isLoading, error: q.isError, retry: () => { q.refetch() } }
}
