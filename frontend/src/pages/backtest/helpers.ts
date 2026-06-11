// 백테스트 본문 공용 순수 헬퍼 (컴포넌트 아님 — react-refresh 규칙상 parts.jsx와 분리)
export const signedPct = (v: any) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'

// 리스크 조정 지표 색상: 양수=빨강(좋음), 음수=파랑(나쁨), 0 부근=회색
export const raColor = (v: any) => (v > 0.1 ? 'text-red-500' : v < -0.1 ? 'text-blue-500' : 'text-gray-600 dark:text-gray-300')
