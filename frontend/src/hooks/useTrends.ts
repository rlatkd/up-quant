import { useFetch } from './useFetch'
import { getIndices, getAssetIndices, getVolumePower, getPeriodReturns, getBrief, getFx, getNews } from '../api/trends'

// 트렌드 대시보드 데이터 훅 — 전부 파라미터 없는 단발 fetch (useFetch: data/loading/error/retry)
export const useIndices       = () => useFetch(getIndices, { indices: [] })
export const useAssetIndices  = () => useFetch(getAssetIndices, { rows: [] })
export const useVolumePower   = () => useFetch(getVolumePower, { buy: [], sell: [], error: null })
export const usePeriodReturns = () => useFetch(getPeriodReturns, { rows: [] })
export const useBrief         = () => useFetch(getBrief, null)
// 환율·뉴스는 외부 소스 — 실패 시 백엔드가 error 메시지를 담아 주므로 그대로 노출
export const useFx            = () => useFetch(getFx, { rates: [], as_of: '', error: null })
export const useNews          = () => useFetch(getNews, { items: [], error: null })
