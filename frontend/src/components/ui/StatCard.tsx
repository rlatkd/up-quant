// 공용 지표 카드. 대시보드 KpiCard·백테스트 MetricCard로 중복 구현되던 것을 통합.
export default function StatCard({ label, value, sub = null, color = '', valueClass = 'text-2xl' }) {
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md px-5 py-4">
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</div>
      <div className={`${valueClass} font-bold ${color || 'text-gray-800 dark:text-gray-100'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}
