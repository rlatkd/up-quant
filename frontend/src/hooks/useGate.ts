// 페이지 로딩/에러 게이트 — 그 페이지가 쓰는 '프리페치 핵심 데이터' 훅들을 모아 한 번에 판정한다.
// 정책: 프리페치(부팅 워밍)되는 데이터는 하나라도 로딩이면 전체 페이지 PageLoading, 하드에러면 PageError로
// 막는다(헤더·푸터만 남김). 외부 소스(환율·뉴스·체결강도)나 종목별 on-demand(캔들·호가)는 이 게이트에
// 넣지 말고 각 요소가 자체 인라인 로딩으로 표시한다(요소 단위 지연이 페이지 전체를 막지 않도록).
interface HookState { loading: boolean; error: boolean; retry?: () => void }

export function useGate(...hooks: HookState[]) {
  return {
    loading: hooks.some(h => h.loading),
    error: hooks.some(h => h.error),
    retry: () => hooks.forEach(h => h.retry?.()),
  }
}
