// 공용 지표 카드. 대시보드 KpiCard·백테스트 MetricCard로 중복 구현되던 것을 통합.
export default function StatCard({ label, value, sub, color, valueClass = 'text-2xl' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-5 py-4">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`${valueClass} font-bold ${color || 'text-gray-800'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}
