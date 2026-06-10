import { describe, it, expect } from 'vitest'
import { sym, rcolor, pct, fmtKrwShort, fmtCap } from './format'

describe('format utils', () => {
  it('sym strips KRW- prefix', () => {
    expect(sym('KRW-BTC')).toBe('BTC')
    expect(sym('')).toBe('')
    expect(sym(null)).toBe('')
  })

  it('rcolor by sign (상승 빨강 / 하락 파랑)', () => {
    expect(rcolor(1)).toContain('red')
    expect(rcolor(-1)).toContain('blue')
    expect(rcolor(0)).toContain('gray')
  })

  it('pct formats sign and dash for null', () => {
    expect(pct(2.345)).toBe('+2.35%')
    expect(pct(-1)).toBe('-1.00%')
    expect(pct(null)).toBe('—')
    expect(pct(undefined)).toBe('—')
  })

  it('fmtKrwShort 조/억', () => {
    expect(fmtKrwShort(1.5e12)).toBe('1.5조')
    expect(fmtKrwShort(2.8e10)).toBe('280억')
    expect(fmtKrwShort(0)).toBe('—')
  })

  it('fmtCap 조/억', () => {
    expect(fmtCap(3e12)).toBe('3.0조')
    expect(fmtCap(null)).toBe('—')
  })
})
