import { useState, useEffect, useCallback } from 'react'
import { getCategoryMonthly, getCategoryDailyCumulative, getCoinStats, getCorrelation, getAdvanceDecline } from '../api/analysis'
import { useFetch } from './useFetch'

const EMPTY_RETURNS = { categories: [], rows: [] }

// Advance-Decline 라인 (시장 폭의 추세). 파라미터 없음 — 거래대금 상위 100종 단일 뷰.
export function useAdvanceDecline() {
  return useFetch(getAdvanceDecline, { points: [], n: 0, n_obs: 0 })
}

// 섹터 일봉 동일가중 누적수익률 (최근 ~200일). 파라미터 없음 — 단일 일봉 뷰.
export function useCategoryDailyCumulative() {
  return useFetch(getCategoryDailyCumulative, EMPTY_RETURNS)
}

export function useCategoryMonthly() {
  return useFetch(getCategoryMonthly, EMPTY_RETURNS)
}

export function useCoinStats() {
  return useFetch(getCoinStats, [])
}

export function useCorrelation(market) {
  // loading/error는 (loadedKey, nonce) 기반으로 파생 — effect 안 setState(true)를 피한다.
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ data: [], error: false, loadedKey: null })
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getCorrelation(market)
      .then(data => { if (!cancelled) setState({ data, error: false, loadedKey: `${market}:${nonce}` }) })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, error: true, loadedKey: `${market}:${nonce}` })) })
    return () => { cancelled = true }
  }, [market, nonce])
  const retry = useCallback(() => setNonce(n => n + 1), [])
  return { data: state.data, loading: state.loadedKey !== `${market}:${nonce}`, error: state.error, retry }
}
