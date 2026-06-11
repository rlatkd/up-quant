// 실시간 시세 외부 store — React Context 대신 종목별 selector 구독을 위해 둔다.
// Context로 전체 prices 맵을 구독하면 한 종목만 바뀌어도 모든 셀이 리렌더된다.
// 여기선 종목별 리스너만 호출 → 각 셀은 "자기 종목" 가격이 바뀔 때만 리렌더(useSyncExternalStore).

const state: { prices: Record<string, any>; connected: boolean; version: number } = { prices: {}, connected: false, version: 0 }
const marketSubs = new Map()  // market → Set<listener>
const connSubs = new Set<() => void>()    // connected 변경 리스너
const anySubs = new Set<() => void>()     // '아무 종목이나 갱신되면' 깨는 리스너(리스트 재정렬·집계용)

export function subscribeMarket(market: any, listener: any) {
  let set = marketSubs.get(market)
  if (!set) { set = new Set(); marketSubs.set(market, set) }
  set.add(listener)
  return () => set.delete(listener)
}
export function getPrice(market: any) {
  return state.prices[market]
}

// 전역 버전 — 배치가 들어올 때마다 +1. 리스트 전체를 라이브로 재정렬/재집계하려는 구독자가
// 종목별 구독 대신 이걸 구독한다(한 배치 = 한 번 깸, 300ms 배치라 빈도 제한적).
export function subscribeAny(listener: any) {
  anySubs.add(listener)
  return () => anySubs.delete(listener)
}
export function getVersion() {
  return state.version
}

export function subscribeConnected(listener: any) {
  connSubs.add(listener)
  return () => connSubs.delete(listener)
}
export function getConnected() {
  return state.connected
}

// Provider(WS 수신)가 호출 — 300ms 배치로 모인 시세를 store에 반영하고 해당 종목 리스너만 깨운다.
export function applyTickers(batch: any) {
  for (const m in batch) state.prices[m] = batch[m]
  for (const m in batch) {
    const set = marketSubs.get(m)
    if (set) set.forEach((fn: any) => fn())
  }
  state.version++                 // 전역 버전 bump → 리스트 재정렬/집계 구독자 1회 깸
  anySubs.forEach((fn) => fn())
}

export function setConnected(value: any) {
  if (state.connected !== value) {
    state.connected = value
    connSubs.forEach((fn) => fn())
  }
}
