import { useFetch } from './useFetch'
import { getIndices, getAssetIndices, getVolumePower, getPeriodReturns, getBrief, getFx, getNews } from '../api/trends'

// 트렌드 대시보드 데이터 훅 — 전부 파라미터 없는 단발 fetch (react-query 백킹: 동일 키 디둡 + 캐시 재사용).
export const useIndices       = () => useFetch(['trends', 'indices'], getIndices, { indices: [] })
export const useAssetIndices  = () => useFetch(['trends', 'asset-indices'], getAssetIndices, { rows: [] })
export const useVolumePower   = () => useFetch(['trends', 'volume-power'], getVolumePower, { buy: [], sell: [], error: null })
export const usePeriodReturns = () => useFetch(['trends', 'period-returns'], getPeriodReturns, { rows: [] })
export const useBrief         = () => useFetch(['trends', 'brief'], getBrief, null)
// 환율·뉴스는 외부 소스 — 실패 시 백엔드가 error 메시지를 담아 주므로 그대로 노출
export const useFx            = () => useFetch(['trends', 'fx'], getFx, { rates: [], as_of: '', error: null })
export const useNews          = () => useFetch(['trends', 'news'], getNews, { items: [], error: null })
