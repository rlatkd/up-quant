import { useState } from 'react'
import Compare from './Compare'
import Backtest from './Backtest'
import Screener from './Screener'

// 비교분석·백테스트·스크리너를 메인 네비에서 분리해 별도 창(window.open('/tools'))에서
// 탭으로 전환하는 부가기능 허브. 헤더(Layout) 밖 단독 라우트로 렌더된다.
const TABS = [
  { key: 'compare',  label: '비교 분석', Comp: Compare },
  { key: 'backtest', label: '백테스트',  Comp: Backtest },
  { key: 'screener', label: '스크리너',  Comp: Screener },
]

export default function ToolsHub() {
  const [tab, setTab] = useState('compare')
  const Active = TABS.find(t => t.key === tab).Comp

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="bg-[#093687] text-white sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 flex items-center h-[60px]">
          <span className="text-[15px] font-semibold tracking-tight mr-8">
            UP<span className="text-sky-300 font-normal">quant</span>
            <span className="text-white/50 text-[13px] ml-2 font-normal">부가기능</span>
          </span>
          <nav className="flex h-full">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center px-4 text-[13px] border-b-2 transition-colors cursor-pointer ${
                  tab === t.key
                    ? 'text-white border-white font-medium'
                    : 'text-white/60 border-transparent hover:text-white/90'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-4 py-5">
        <Active />
      </main>
    </div>
  )
}
