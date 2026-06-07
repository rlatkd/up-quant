import { useState, useEffect } from 'react'
import * as quant from '../api/quant'

// 파라미터가 바뀌면 재요청하되, loading은 (loadedKey !== 현재키)로 파생해
// effect 안 setLoading(true)을 피한다(react-hooks/set-state-in-effect 회피, useAnalysis와 동일 패턴).
function useKeyed(fetcher, key, initial) {
  const [state, setState] = useState({ data: initial, loadedKey: null })
  useEffect(() => {
    let cancelled = false
    fetcher()
      .then(d => { if (!cancelled) setState({ data: d, loadedKey: key }) })
      .catch(() => { if (!cancelled) setState({ data: initial, loadedKey: key }) })
    return () => { cancelled = true }
    // fetcher는 key로부터 파생되므로 key만 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { data: state.data, loading: state.loadedKey !== key }
}

const EMPTY_PORTFOLIO = { points: [], frontier: [], max_sharpe: { weights: [] }, min_vol: { weights: [] }, assets: [], n_obs: 0 }
const EMPTY_NETWORK = { nodes: [], edges: [], n_obs: 0 }
const EMPTY_PCA = { components: [], loadings: [], pc1_explained: 0, n_obs: 0 }
const EMPTY_CLUSTERS = { points: [], k: 0, n: 0 }
const EMPTY_DENDRO = { icoord: [], dcoord: [], labels: [], markets: [], categories: [], n_obs: 0 }
const EMPTY_GARCH = { cond_vol: [], forecast_vol: [], current_vol_annual: 0, var_95: 0, persistence: 0, n_obs: 0, korean_name: '' }
const EMPTY_MOM = { equity: [], total_return: 0, benchmark_return: 0, sharpe: 0, mdd: 0, long: [], short: [], n: 0 }
const EMPTY_PAIRS = { pairs: [], tested: 0, found: 0, n_obs: 0 }
const EMPTY_REGIME = { points: [], stats: [], current_regime: 0, current_label: '', n_states: 0, n_obs: 0 }

export const usePortfolio  = (markets)        => useKeyed(() => quant.getPortfolio(markets), markets.join(','), EMPTY_PORTFOLIO)
export const useNetwork    = (top = 50)       => useKeyed(() => quant.getNetwork(top), `net:${top}`, EMPTY_NETWORK)
export const usePCA        = (top = 50)       => useKeyed(() => quant.getPCA(top), `pca:${top}`, EMPTY_PCA)
export const useClusters   = (top = 80, k = 4) => useKeyed(() => quant.getClusters(top, k), `clu:${top}:${k}`, EMPTY_CLUSTERS)
export const useDendrogram = (top = 40)       => useKeyed(() => quant.getDendrogram(top), `den:${top}`, EMPTY_DENDRO)
export const useGarch      = (market)         => useKeyed(() => quant.getGarch(market), `gar:${market}`, EMPTY_GARCH)
export const useMomentum   = (top = 40, lb = 20, hd = 5) => useKeyed(() => quant.getMomentum(top, lb, hd), `mom:${top}:${lb}:${hd}`, EMPTY_MOM)
export const usePairs      = (top = 50)       => useKeyed(() => quant.getPairs(top), `pair:${top}`, EMPTY_PAIRS)
export const useRegime     = (nStates = 2)    => useKeyed(() => quant.getRegime(nStates), `reg:${nStates}`, EMPTY_REGIME)
