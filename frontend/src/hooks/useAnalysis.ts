import { useState, useEffect } from 'react'
import { getCategoryMonthly, getCategoryDailyCumulative, getCoinStats, getCorrelation, getAdvanceDecline } from '../api/analysis'

const EMPTY_RETURNS = { categories: [], rows: [] }

// Advance-Decline 라인 (시장 폭의 추세). 파라미터 없음 — 거래대금 상위 100종 단일 뷰.
export function useAdvanceDecline() {
  const [data, setData] = useState({ points: [], n: 0, n_obs: 0 })
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getAdvanceDecline().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

// 섹터 일봉 동일가중 누적수익률 (최근 ~200일). 파라미터 없음 — 단일 일봉 뷰.
export function useCategoryDailyCumulative() {
  const [data, setData] = useState(EMPTY_RETURNS)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCategoryDailyCumulative().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

export function useCategoryMonthly() {
  const [data, setData] = useState(EMPTY_RETURNS)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCategoryMonthly().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

export function useCoinStats() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    getCoinStats().then(setData).finally(() => setLoading(false))
  }, [])
  return { data, loading }
}

export function useCorrelation(market) {
  // loading은 (loadedKey !== market)로 파생 — effect 안 setLoading(true) 제거하여
  // cascading render(react-hooks/set-state-in-effect) 회피.
  const [state, setState] = useState({ data: [], loadedKey: null })
  useEffect(() => {
    if (!market) return
    let cancelled = false
    getCorrelation(market).then(data => {
      if (!cancelled) setState({ data, loadedKey: market })
    })
    return () => { cancelled = true }
  }, [market])
  return { data: state.data, loading: state.loadedKey !== market }
}
