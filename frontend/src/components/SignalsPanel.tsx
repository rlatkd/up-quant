import { useNavigate } from 'react-router-dom'
import { useSignals } from '../hooks/useSignals'
import { rcolor } from '../utils/format'
import InfoTooltip from './InfoTooltip'

// 실행 가능한 시그널 패널 — 흩어진 정량 분석 결과(모멘텀 롱·페어 진입·국면 전환·돌파)를 한 곳에 모아
// 클릭하면 해당 분석/종목으로 이동(deep-link). "보여주기"에서 "다음 액션"으로 잇는 실행 연결.
const KIND_META: Record<string, { label: string; color: string }> = {
  regime: { label: '국면', color: 'text-violet-500 bg-violet-50 dark:bg-violet-500/10' },
  momentum: { label: '모멘텀', color: 'text-brand-600 bg-brand-50 dark:bg-brand-500/10' },
  pair: { label: '페어', color: 'text-teal-600 bg-teal-50 dark:bg-teal-500/10' },
  breakout: { label: '돌파', color: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10' },
}

// 좌측 시장지수 컬럼 높이를 우측 랭킹 레일과 맞추기 위해 시그널을 고정 칸수로 제한한다.
// 시그널이 칸수보다 적으면 빈 칸을 회색으로 채워 높이를 유지(많으면 잘라 캡). 칸수 = SLOTS.
const SLOTS = 12

export default function SignalsPanel() {
  const navigate = useNavigate()
  const { data, loading } = useSignals()
  const items = data.items || []
  const shown = items.slice(0, SLOTS)
  const pads = Math.max(0, SLOTS - shown.length)

  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-[#232d40] flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">실행 가능한 시그널</span>
        <span className="text-[10px] text-gray-400">· 정량 분석 종합</span>
        <InfoTooltip width="w-80">모멘텀 롱 후보·공적분 페어 진입(|z|&gt;2)·HMM 국면 전환·52주 돌파/급등을 한곳에 모았습니다. 클릭하면 해당 분석/종목으로 이동합니다. <b>인샘플·생존편향·거래비용</b> 한계가 있는 후보이며 매매 보장이 아닙니다.</InfoTooltip>
        {data.regime_label && (
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">현재 국면 <b className="text-gray-700 dark:text-gray-200">{data.regime_label}</b></span>
        )}
      </div>
      {/* 국면 전환은 가장 중요한 거시 신호 — 배너로 강조(알림 성격) */}
      {data.regime_changed && (
        <div className="px-4 py-2 bg-violet-50 dark:bg-violet-500/10 border-b border-violet-100 dark:border-violet-500/20 text-xs text-violet-700 dark:text-violet-300 flex items-center gap-2 cursor-pointer"
          onClick={() => navigate('/research/regime')}>
          <span>⚡</span><span>시장 국면이 <b>{data.regime_label}</b>(으)로 전환됐습니다 — 익스포저를 점검하세요. (클릭 → 시장 국면)</span>
        </div>
      )}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-400">시그널 집계 중…</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-100 dark:bg-[#232d40]">
          {shown.map((s, i: number) => {
            const meta = KIND_META[s.kind] || { label: s.kind, color: 'text-gray-500 bg-gray-50' }
            return (
              <div key={i} onClick={() => s.action && navigate(s.action)}
                className="bg-white dark:bg-[#1a2234] px-4 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-[#222c3e] transition-colors">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${meta.color}`}>{meta.label}</span>
                  {s.value != null && s.kind !== 'regime' && (
                    <span className={`text-xs font-semibold tabular-nums ml-auto ${s.kind === 'pair' ? 'text-gray-600 dark:text-gray-300' : rcolor(s.value)}`}>
                      {s.kind === 'pair' ? `z ${s.value.toFixed(2)}` : (s.value > 0 ? '+' : '') + s.value.toFixed(1) + '%'}
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{s.title}</div>
                {s.detail && <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{s.detail}</div>}
              </div>
            )
          })}
          {/* 칸수만큼 결과가 없으면 회색 빈 칸으로 채워 높이 유지(전부 없으면 첫 칸에 안내) */}
          {Array.from({ length: pads }).map((_, i) => (
            <div key={`pad-${i}`} className="bg-gray-50 dark:bg-[#141b29] px-4 py-2.5 min-h-[58px] flex items-center justify-center">
              {items.length === 0 && i === 0 && <span className="text-xs text-gray-300 dark:text-gray-600">현재 뚜렷한 시그널 없음</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
