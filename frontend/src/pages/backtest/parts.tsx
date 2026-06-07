import { downloadChartPng } from '../../utils/chartExport'

// 백테스트 전략 본문들이 공유하는 소품 컴포넌트. (순수 헬퍼는 helpers.js)

// 차트 카드 우상단 PNG 저장 버튼 — 부모가 ref로 카드 컨테이너를 넘기면 그 안 SVG를 캡처.
export function PngButton({ targetRef, name }) {
  return (
    <button onClick={() => downloadChartPng(targetRef.current, name)}
      className="px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-[#2c3850] text-gray-500 dark:text-gray-400 hover:bg-gray-50 cursor-pointer transition-colors">
      PNG
    </button>
  )
}

export function MetricCard({ label, value, color = 'text-gray-800 dark:text-gray-100', sub = null }) {
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md px-5 py-4 text-center">
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-7 h-7 border-2 border-gray-200 dark:border-[#2c3850] border-t-brand-500 rounded-full animate-spin" />
    </div>
  )
}

// 종목 선택 드롭다운(전략 비교·워크포워드·몬테카를로 공용)
export function MarketSelect({ market, setMarket, tickers }) {
  return (
    <select value={market} onChange={e => setMarket(e.target.value)}
      className="border border-gray-200 dark:border-[#2c3850] rounded-md px-3 py-2 text-sm cursor-pointer focus:outline-none focus:border-brand-400">
      {tickers.slice(0, 80).map(t => (
        <option key={t.market} value={t.market}>{t.market.replace('KRW-', '')} · {t.korean_name}</option>
      ))}
    </select>
  )
}
