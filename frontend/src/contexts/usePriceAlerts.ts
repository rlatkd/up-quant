import { createContext, useContext } from 'react'

// 가격 알림 context — Provider(PriceAlerts.jsx)와 hook을 분리(react-refresh/only-export-components 대응).
export const PriceAlertContext = createContext(null)

export function usePriceAlerts() {
  const ctx = useContext(PriceAlertContext)
  if (!ctx) throw new Error('usePriceAlerts must be used within PriceAlertProvider')
  return ctx
}
