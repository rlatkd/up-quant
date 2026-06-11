import { useState, useCallback } from 'react'
import { useTickers } from '../hooks/useTickers'
import PageLoading from '../components/ui/PageLoading'
import CompareBody from './backtest/CompareBody'
import WalkForwardBody from './backtest/WalkForwardBody'
import MonteCarloBody from './backtest/MonteCarloBody'

// 검증 · 시뮬레이션 — 전략의 강건성(과최적화)·전망을 점검하는 메타 분석. 전략을 "실행"하는
// 백테스트(/strategy/backtest)와 성격이 달라 별도 페이지로 둔다. 3기법(전략비교·워크포워드·
// 몬테카를로)은 각각 내용 높이가 짧아 드롭다운으로 나누지 않고 한 페이지에 세로로 모아 표시한다.

function Section({ no, label, desc, children }: { no: number; label: string; desc: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{no}. {label}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500">{desc}</span>
      </div>
      {children}
    </section>
  )
}

export default function Validation() {
  const { tickers, loading: tLoading } = useTickers()
  // 기법마다 종목을 독립으로 둔다(한 페이지에 셋이 공존).
  const [mCompare, setMCompare] = useState('KRW-BTC')
  const [mWalk, setMWalk] = useState('KRW-BTC')
  const [mMonte, setMMonte] = useState('KRW-BTC')

  // 페이지 단위 단일 로딩 게이트 — 세 기법이 각자 스피너를 띄우지 않고, 셋의 초기 데이터가 모두
  // 준비될 때까지 헤더·푸터만 남기고 하나의 PageLoading만 보인다(요소별 분할 로딩 금지).
  const [ready, setReady] = useState(0)
  const bump = useCallback(() => setReady((n) => n + 1), [])
  const allReady = ready >= 3

  if (tLoading) return <PageLoading />

  return (
    <div>
      {!allReady && <PageLoading />}
      {/* 바디는 항상 마운트해 초기 데이터를 받되, 셋 다 준비되기 전엔 통째로 숨긴다(분할 스피너 방지). */}
      <div className={allReady ? 'space-y-8' : 'hidden'}>
        <Section no={1} label="전략 비교" desc="MA 크로스·RSI 역추세를 같은 종목에 돌려 자산곡선을 겹쳐 비교">
          <CompareBody market={mCompare} setMarket={setMCompare} tickers={tickers} onReady={bump} />
        </Section>
        <Section no={2} label="워크포워드" desc="구간 분할 인샘플 최적화 → 아웃오브샘플 검증(과최적화 p값)">
          <WalkForwardBody market={mWalk} setMarket={setMWalk} tickers={tickers} onReady={bump} />
        </Section>
        <Section no={3} label="몬테카를로" desc="과거 일간수익률 부트스트랩 1000경로 → 손실 확률·분위 부채꼴">
          <MonteCarloBody market={mMonte} setMarket={setMMonte} tickers={tickers} onReady={bump} />
        </Section>
      </div>
    </div>
  )
}
