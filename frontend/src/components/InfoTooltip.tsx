import type { ReactNode } from 'react'

// 제목 옆 '?' 아이콘. 호버하면 상세 안내 말풍선을 아래쪽에 띄운다.
// 부가기능(비교·백테스트·스크리너)의 "종목을 선택하세요" 같은 빈 안내문 대체용.
export default function InfoTooltip({ children, width = 'w-72' }: { children?: ReactNode; width?: string }) {
  return (
    <span className="relative inline-flex group align-middle ml-1">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-gray-400 dark:text-gray-500 text-[10px] leading-none cursor-help select-none">
        ?
      </span>
      <span
        className={`pointer-events-none absolute left-0 top-6 z-30 ${width} rounded-lg bg-gray-800 text-white text-xs leading-relaxed p-3 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg`}
      >
        {children}
      </span>
    </span>
  )
}
