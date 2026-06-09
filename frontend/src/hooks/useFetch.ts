import { useQuery } from '@tanstack/react-query'

// 파라미터 없는 단발 fetch 공용 훅 — react-query로 백킹해 { data, loading, error, retry }를 일관 제공.
// 핵심 효과: 같은 queryKey를 여러 컴포넌트가 호출해도 네트워크는 1회(디둡), 페이지 재방문 시 staleTime
// 내면 캐시에서 즉시 렌더(재요청 없음). placeholderData로 첫 로드 전엔 initial을 주되 loading=true를 유지한다
// (initialData를 쓰면 즉시 success가 돼 로딩 게이트가 안 떠서 placeholderData를 쓴다).
export function useFetch<T>(key: unknown, fetcher: () => Promise<T>, initial: T) {
  const queryKey = Array.isArray(key) ? key : [key]
  const q = useQuery<T>({
    queryKey,
    queryFn: fetcher,
    // 제네릭 T가 함수형일 수 있다는 react-query 타입 가드 때문에 캐스팅(여기 T는 데이터 형상).
    placeholderData: initial as any,
  })
  return {
    data: (q.data ?? initial) as T,
    loading: q.isLoading,        // 캐시가 없을 때의 첫 로드에서만 true (재방문/디둡 시 false → 즉시 렌더)
    error: q.isError,
    retry: () => { q.refetch() },
  }
}
