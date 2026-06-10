// 공용 포맷/색 헬퍼 — 페이지마다 복붙돼 있던 sym/pct/rcolor/fmt* 를 한 곳에서 관리(일관성·중복 제거).
// 의미색(상승 빨강 / 하락 파랑)은 한국 거래소 관행 고정.

export const sym = (m: string | undefined | null) => (m || '').replace('KRW-', '')

// 상승/하락/보합 텍스트 색 클래스(다크모드 포함).
export function rcolor(v: number): string {
  return v > 0 ? 'text-red-500' : v < 0 ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'
}

// 퍼센트 표기(부호 포함). null/undefined는 '—'.
export function pct(v: number | null | undefined, d = 2): string {
  if (v == null || Number.isNaN(v)) return '—'
  return (v > 0 ? '+' : '') + v.toFixed(d) + '%'
}

// 원화 짧은 표기(조/억). KRW 접미사는 호출부에서.
export function fmtKrwShort(v: number | null | undefined): string {
  if (!v) return '—'
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '조'
  if (v >= 1e8) return Math.round(v / 1e8).toLocaleString() + '억'
  return v.toLocaleString()
}

// 시가총액 표기(조/억).
export function fmtCap(v: number | null | undefined): string {
  if (!v) return '—'
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '조'
  if (v >= 1e8) return Math.round(v / 1e8).toLocaleString() + '억'
  return v.toLocaleString()
}
