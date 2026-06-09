import { useState, useEffect, useCallback } from 'react'

// 파라미터 없는 단발 fetch 공용 훅 — { data, loading, error, retry } 일관 제공.
// 설계: loading을 별도 상태로 들지 않고 (doneNonce !== nonce)로 파생한다.
//  → effect 본문에서 setState(true)를 호출하지 않아 cascading render(react-hooks/set-state-in-effect)를 피한다.
//  retry()는 nonce를 올려 effect를 재실행한다(실패한 화면의 "다시 시도" 버튼용).
export function useFetch<T>(fetcher: () => Promise<T>, initial: T) {
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState({ data: initial, error: false, doneNonce: -1 })

  useEffect(() => {
    let cancelled = false
    fetcher()
      .then(d => { if (!cancelled) setState({ data: d, error: false, doneNonce: nonce }) })
      .catch(() => { if (!cancelled) setState(s => ({ ...s, error: true, doneNonce: nonce })) })
    return () => { cancelled = true }
    // fetcher는 호출부에서 매 렌더 새로 생성될 수 있어 의존성에서 제외하고 nonce로만 재실행을 제어한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce])

  const retry = useCallback(() => setNonce(n => n + 1), [])
  return { data: state.data, loading: state.doneNonce !== nonce, error: state.error, retry }
}
