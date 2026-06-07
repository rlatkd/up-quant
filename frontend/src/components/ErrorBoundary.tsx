import { Component } from 'react'

// 페이지 단위 에러 경계 — 한 화면에서 던져진 예외가 헤더·푸터까지 언마운트하지 않도록 가둔다.
// (Phase 23: lightweight-charts v5 API 이동으로 RSI 클릭 시 TypeError → 경계가 없어 전 화면이 흰 화면이 됐던 사건 계기)
// 함수형 컴포넌트는 에러 경계를 만들 수 없어 class로 작성(getDerivedStateFromError/componentDidCatch).
export default class ErrorBoundary extends Component<any, { error: any }> {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // 콘솔에 남겨 진단 가능하게(외부 수집기 없음 — 직접 구현 정체성상 콘솔로 충분).
    console.error('[ErrorBoundary] UI 렌더 오류:', error, info?.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">이 화면을 표시하는 중 문제가 발생했습니다</div>
          <div className="text-sm text-gray-400 dark:text-gray-500 mb-5">다른 메뉴는 정상 동작합니다. 아래 버튼으로 다시 시도하거나 새로고침하세요.</div>
          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-md bg-brand-500 text-white text-sm font-medium cursor-pointer hover:bg-brand-600 transition-colors"
            >
              다시 시도
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md border border-gray-200 dark:border-[#2c3850] text-gray-600 dark:text-gray-300 text-sm font-medium cursor-pointer hover:bg-gray-50 transition-colors"
            >
              새로고침
            </button>
          </div>
          {import.meta.env.DEV && (
            <pre className="mt-5 max-w-2xl overflow-x-auto text-left text-[11px] text-red-400 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
