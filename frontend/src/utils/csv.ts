// 표 데이터 CSV 내보내기 — 퀀트가 자기 분석/엑셀로 가져갈 수 있게(실행 연결의 일부).
// Excel 한글 깨짐 방지를 위해 UTF-8 BOM을 앞에 붙인다.

interface Column<T> { key: keyof T | string; label: string; map?: (row: T) => unknown }

function cell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  // 콤마·따옴표·줄바꿈 포함 시 따옴표로 감싸고 내부 따옴표는 이스케이프.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv<T>(filename: string, rows: T[], columns: Column<T>[]): void {
  const header = columns.map(c => cell(c.label)).join(',')
  const body = rows.map(row =>
    columns.map(c => cell(c.map ? c.map(row) : (row as any)[c.key])).join(',')
  ).join('\n')
  const BOM = String.fromCharCode(0xFEFF)        // UTF-8 BOM(Excel 한글 깨짐 방지)
  const csv = BOM + header + '\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
