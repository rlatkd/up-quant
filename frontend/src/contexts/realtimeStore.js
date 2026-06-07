// 실시간 시세 외부 store — React Context 대신 종목별 selector 구독을 위해 둔다.
// Context로 전체 prices 맵을 구독하면 한 종목만 바뀌어도 모든 셀이 리렌더된다.
// 여기선 종목별 리스너만 호출 → 각 셀은 "자기 종목" 가격이 바뀔 때만 리렌더(useSyncExternalStore).

const state = { prices: {}, connected: false }
const marketSubs = new Map()  // market → Set<listener>
const connSubs = new Set()    // connected 변경 리스너

export function subscribeMarket(market, listener) {
  let set = marketSubs.get(market)
  if (!set) { set = new Set(); marketSubs.set(market, set) }
  set.add(listener)
  return () => set.delete(listener)
}
export function getPrice(market) {
  return state.prices[market]
}

export function subscribeConnected(listener) {
  connSubs.add(listener)
  return () => connSubs.delete(listener)
}
export function getConnected() {
  return state.connected
}

// Provider(WS 수신)가 호출 — 300ms 배치로 모인 시세를 store에 반영하고 해당 종목 리스너만 깨운다.
export function applyTickers(batch) {
  for (const m in batch) state.prices[m] = batch[m]
  for (const m in batch) {
    const set = marketSubs.get(m)
    if (set) set.forEach(fn => fn())
  }
}

export function setConnected(value) {
  if (state.connected !== value) {
    state.connected = value
    connSubs.forEach(fn => fn())
  }
}
