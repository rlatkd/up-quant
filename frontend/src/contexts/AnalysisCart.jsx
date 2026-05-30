import { createContext, useState, useEffect, useCallback, useMemo } from 'react'

// 분석 카트 — 사용자가 여러 화면(코인목록·마켓·스크리너·섹터 등)에서 모은 종목 집합을
// Compare·Backtest 진입 시 자동으로 채워주는 전역 상태. localStorage 영속.
//
// 단순한 Set<market>이 본체. UI에선 카운트(헤더 배지)와 토글(+/✓) 액션만 노출.
// Compare는 최대 5종 제약 — 카트는 무제한으로 담되 진입 시 상위 5만 채워주는 식.

const LS_KEY = 'upquant_analysis_cart'

function loadCart() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    return Array.isArray(arr) ? arr.filter(m => typeof m === 'string') : []
  } catch { return [] }
}

function saveCart(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}

// Context는 export하되 hook은 별도 파일(useAnalysisCart.js)에서 import — fast refresh 규칙
// eslint-disable-next-line react-refresh/only-export-components
export const AnalysisCartContext = createContext(null)

export function AnalysisCartProvider({ children }) {
  // 순서 유지(담은 순서대로 Compare에 채워야 직관적) → 배열 + has 체크
  const [items, setItems] = useState(loadCart)

  useEffect(() => { saveCart(items) }, [items])

  const has    = useCallback(market => items.includes(market), [items])
  const add    = useCallback(market => setItems(prev => prev.includes(market) ? prev : [...prev, market]), [])
  const remove = useCallback(market => setItems(prev => prev.filter(m => m !== market)), [])
  const toggle = useCallback(market => setItems(prev => prev.includes(market) ? prev.filter(m => m !== market) : [...prev, market]), [])
  const clear  = useCallback(() => setItems([]), [])

  const value = useMemo(() => ({
    items, count: items.length, has, add, remove, toggle, clear,
  }), [items, has, add, remove, toggle, clear])

  return <AnalysisCartContext.Provider value={value}>{children}</AnalysisCartContext.Provider>
}
