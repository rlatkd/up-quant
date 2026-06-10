import { useFetch } from './useFetch'
import { getSignals } from '../api/signals'

// 실행 가능한 시그널(모멘텀·페어·국면·돌파) — 프리페치 합성이라 빠름.
export const useSignals = () => useFetch(['signals'], getSignals, {
  as_of: '', regime_label: '', regime_changed: false, items: [], n: 0,
})
