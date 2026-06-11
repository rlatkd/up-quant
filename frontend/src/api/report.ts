import api from './client'
import type { ReportResult } from '../types'

// LLM(Gemini) 투자 전략 리포트 — 종류별 차등 캐시(백엔드). report_type: market | portfolio | risk
export const getStrategyReport = (reportType = 'market'): Promise<ReportResult> =>
  api.get('/api/report/strategy', { params: { report_type: reportType } }).then(r => r.data)
