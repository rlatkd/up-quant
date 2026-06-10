import { useQuery, keepPreviousData } from '@tanstack/react-query'
import * as quant from '../api/quant'

// react-query 백킹 공용 — queryKey로 디둡·캐시(파라미터별 키 분리). 반환 계약은 기존과 동일
// ({ data, loading, error, retry }). 무거운 퀀트 집계라 페이지 재방문 시 캐시 즉시 렌더가 특히 이득.
// keepPreviousData: 종목/파라미터를 바꿔도 새 결과가 올 때까지 이전 결과를 보여줘 깜빡임을 없앤다.
function useKeyed(queryKey, fetcher, initial) {
  const q = useQuery({ queryKey, queryFn: fetcher, placeholderData: keepPreviousData })
  return { data: q.data ?? initial, loading: q.isLoading, error: q.isError, retry: () => { q.refetch() } }
}

const EMPTY_PORTFOLIO = { points: [], frontier: [], max_sharpe: { weights: [] }, min_vol: { weights: [] }, assets: [], n_obs: 0 }
const EMPTY_NETWORK = { nodes: [], edges: [], n_obs: 0 }
const EMPTY_PCA = { components: [], loadings: [], pc1_explained: 0, n_obs: 0 }
const EMPTY_CLUSTERS = { points: [], k: 0, n: 0 }
const EMPTY_DENDRO = { icoord: [], dcoord: [], labels: [], markets: [], categories: [], n_obs: 0 }
const EMPTY_GARCH = { cond_vol: [], forecast_vol: [], current_vol_annual: 0, var_95: 0, persistence: 0, n_obs: 0, korean_name: '' }
const EMPTY_MOM = { equity: [], total_return: 0, benchmark_return: 0, sharpe: 0, mdd: 0, long: [], short: [], n: 0, long_only: false }
const EMPTY_PAIRS = { pairs: [], tested: 0, found: 0, n_obs: 0, best: null }
const EMPTY_REGIME = { points: [], stats: [], current_regime: 0, current_label: '', n_states: 0, n_obs: 0 }

export const usePortfolio  = (markets)        => useKeyed(['quant', 'portfolio', markets.join(',')], () => quant.getPortfolio(markets), EMPTY_PORTFOLIO)
export const useNetwork    = (top = 50)       => useKeyed(['quant', 'network', top], () => quant.getNetwork(top), EMPTY_NETWORK)
export const usePCA        = (top = 50)       => useKeyed(['quant', 'pca', top], () => quant.getPCA(top), EMPTY_PCA)
export const useClusters   = (top = 80, k = 4) => useKeyed(['quant', 'clusters', top, k], () => quant.getClusters(top, k), EMPTY_CLUSTERS)
export const useDendrogram = (top = 40)       => useKeyed(['quant', 'dendrogram', top], () => quant.getDendrogram(top), EMPTY_DENDRO)
export const useGarch      = (market)         => useKeyed(['quant', 'garch', market], () => quant.getGarch(market), EMPTY_GARCH)
export const useMomentum   = (top = 40, lb = 20, hd = 5, longOnly = false) => useKeyed(['quant', 'momentum', top, lb, hd, longOnly], () => quant.getMomentum(top, lb, hd, longOnly), EMPTY_MOM)
export const usePairs      = (top = 50)       => useKeyed(['quant', 'pairs', top], () => quant.getPairs(top), EMPTY_PAIRS)
export const useRegime     = (nStates = 2)    => useKeyed(['quant', 'regime', nStates], () => quant.getRegime(nStates), EMPTY_REGIME)
