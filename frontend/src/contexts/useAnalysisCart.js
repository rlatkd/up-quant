import { useContext } from 'react'
import { AnalysisCartContext } from './AnalysisCart.jsx'

// Provider와 분리된 hook 파일 — react-refresh/only-export-components 규칙 대응
// (jsx 파일은 컴포넌트만 export해야 fast refresh가 정상 동작)
export function useAnalysisCart() {
  const ctx = useContext(AnalysisCartContext)
  if (!ctx) throw new Error('useAnalysisCart must be used within AnalysisCartProvider')
  return ctx
}
