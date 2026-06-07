// 공용 카드. 패딩·보더·라운드를 한 곳에서 결정해 페이지마다 제각각이던 카드 스타일을 통일.
// (업비트 톤: 흰 카드 + 얇은 회색 보더 + 차분한 라운드)
export function Card({ className = '', padded = true, children }) {
  return (
    <div className={`bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md ${padded ? 'p-5' : ''} ${className}`}>
      {children}
    </div>
  )
}

// 카드 제목줄. title/subtitle 간격을 통일(기존 mb-0.5·mb-1·mb-3 혼재 해소). action은 우측 컨트롤.
export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${subtitle ? 'mb-4' : 'mb-3'} ${className}`}>
      <div>
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}
