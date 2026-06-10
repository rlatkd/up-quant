import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportCsv } from './csv'

// jsdom엔 createObjectURL이 없으므로 스텁. anchor click을 가로채 다운로드 흐름만 검증.
describe('exportCsv', () => {
  let created: Blob | null = null
  beforeEach(() => {
    created = null
    URL.createObjectURL = vi.fn((b: Blob) => { created = b; return 'blob:mock' }) as any
    URL.revokeObjectURL = vi.fn() as any
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it('CSV에 BOM + 헤더 + 행, 특수문자 이스케이프', async () => {
    exportCsv('t', [{ a: 1, b: 'x,y' }, { a: 2, b: 'he said "hi"' }], [
      { key: 'a', label: 'A' }, { key: 'b', label: 'B' },
    ])
    expect(created).not.toBeNull()
    // Blob.text()는 스펙상 선행 BOM을 디코딩 시 제거하므로, 원시 바이트로 BOM(EF BB BF) 확인.
    const bytes = new Uint8Array(await (created as Blob).arrayBuffer())
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xEF, 0xBB, 0xBF])
    const text = await (created as Blob).text()
    expect(text).toContain('A,B')
    expect(text).toContain('"x,y"')                     // 콤마 포함 → 따옴표 감쌈
    expect(text).toContain('"he said ""hi"""')          // 따옴표 이스케이프
  })

  it('map 함수로 값 변환', async () => {
    exportCsv('t', [{ v: 0.5 }], [{ key: 'v', label: 'V', map: r => (r.v * 100).toFixed(0) + '%' }])
    const text = await (created as Blob).text()
    expect(text).toContain('50%')
  })
})
