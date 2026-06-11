import api from './client'
import type { SignalsResult } from '../types'

// 실행 가능한 시그널 집계(모멘텀·페어·국면·돌파) — 백엔드가 기존 캐시를 합성.
export const getSignals = (): Promise<SignalsResult> => api.get('/api/signals').then(r => r.data)
