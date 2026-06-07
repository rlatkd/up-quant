import { useState, useEffect } from 'react'
import { getStrategyReport } from '../api/report'

// LLM 투자 전략 리포트 모달 — 종류 선택 → 생성(백엔드가 종류별로 캐시) → 마크다운 미리보기 + 복사/다운로드.
const TYPES = [
  { key: 'market', label: '시장 개관' },
  { key: 'portfolio', label: '포트폴리오 전략' },
  { key: 'risk', label: '리스크 진단' },
]

// 인라인 마크다운(**굵게**, *기울임*, `코드`) → React 노드.
function renderInline(text) {
  const out = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0, m, k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k++} className="px-1 rounded bg-gray-100 dark:bg-[#222c3e] text-[0.9em]">{tok.slice(1, -1)}</code>)
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// 라인 단위 경량 마크다운 렌더(제목·인용·리스트·구분선·문단). 외부 라이브러리 없이 문서 느낌만.
function Markdown({ text }) {
  const lines = text.split('\n')
  const out = []
  let list = []
  const flush = () => {
    if (list.length) { out.push(<ul key={`ul${out.length}`} className="list-disc pl-5 space-y-1 my-2 text-sm text-gray-700 dark:text-gray-200">{list}</ul>); list = [] }
  }
  lines.forEach((ln, i) => {
    if (ln.startsWith('### ')) { flush(); out.push(<h3 key={i} className="text-sm font-bold text-gray-800 dark:text-gray-100 mt-4 mb-1">{renderInline(ln.slice(4))}</h3>) }
    else if (ln.startsWith('## ')) { flush(); out.push(<h2 key={i} className="text-base font-bold text-gray-800 dark:text-gray-100 mt-5 mb-2 pb-1 border-b border-gray-100 dark:border-[#232d40]">{renderInline(ln.slice(3))}</h2>) }
    else if (ln.startsWith('# ')) { flush(); out.push(<h1 key={i} className="text-xl font-bold text-gray-900 dark:text-gray-50 mt-2 mb-1">{renderInline(ln.slice(2))}</h1>) }
    else if (ln.startsWith('> ')) { flush(); out.push(<blockquote key={i} className="border-l-3 border-amber-400 bg-amber-50 dark:bg-[#2a2417] text-amber-800 dark:text-amber-300 text-xs px-3 py-2 my-2 rounded-r">{renderInline(ln.slice(2))}</blockquote>) }
    else if (ln.startsWith('- ')) { list.push(<li key={i}>{renderInline(ln.slice(2))}</li>) }
    else if (ln.trim() === '---') { flush(); out.push(<hr key={i} className="my-4 border-gray-100 dark:border-[#232d40]" />) }
    else if (ln.trim() === '') { flush() }
    else if (ln.startsWith('*') && ln.endsWith('*')) { flush(); out.push(<p key={i} className="text-xs text-gray-400 dark:text-gray-500 -mt-1 mb-2">{ln.slice(1, -1)}</p>) }
    else { flush(); out.push(<p key={i} className="text-sm leading-relaxed text-gray-700 dark:text-gray-200 my-1.5">{renderInline(ln)}</p>) }
  })
  flush()
  return <div>{out}</div>
}

export default function ReportModal({ onClose }) {
  const [type, setType] = useState('market')
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
  // loading은 파생값 — 현재 type과 받아둔 데이터의 type이 다르면 로딩 중(effect 안 setState 회피).
  const loading = !data || data.report_type !== type

  useEffect(() => {
    let alive = true
    getStrategyReport(type).then(d => { if (alive) setData(d) })
    return () => { alive = false }
  }, [type])

  function copy() {
    navigator.clipboard?.writeText(data?.markdown || '').then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }
  function download() {
    const blob = new Blob([data?.markdown || ''], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `upquant-${type}-report.md`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-[#1a2234] rounded-lg shadow-2xl border border-gray-200 dark:border-[#2c3850]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-[#232d40] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI 전략 리포트</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 dark:bg-[#18253c] text-brand-600 font-medium">Gemini</span>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 cursor-pointer text-xl leading-none">×</button>
        </div>

        {/* 종류 탭 */}
        <div className="flex gap-1.5 px-5 pt-3 shrink-0">
          {TYPES.map(t => (
            <button key={t.key} onClick={() => setType(t.key)}
              className={`px-3 py-1.5 text-xs rounded font-medium cursor-pointer transition-colors ${
                type === t.key ? 'bg-brand-500 text-white' : 'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400 hover:bg-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[240px]">
          {loading ? (
            <div className="h-full flex items-center justify-center py-16">
              <div className="w-7 h-7 border-2 border-gray-200 dark:border-[#2c3850] border-t-brand-500 rounded-full animate-spin" />
            </div>
          ) : data ? (
            <Markdown text={data.markdown} />
          ) : (
            <div className="text-sm text-gray-400 py-10 text-center">불러오지 못했습니다</div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#232d40] shrink-0">
          {data && !data.enabled && (
            <span className="text-[11px] text-amber-600">⚠ LLM 미연동 · 데이터 기반 자동 초안</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={copy} disabled={!data}
              className="px-3 py-1.5 text-xs rounded border border-gray-200 dark:border-[#2c3850] text-gray-500 dark:text-gray-400 hover:bg-gray-50 cursor-pointer disabled:opacity-40 transition-colors">
              {copied ? '복사됨!' : '마크다운 복사'}
            </button>
            <button onClick={download} disabled={!data}
              className="px-3 py-1.5 text-xs rounded bg-brand-500 text-white font-medium hover:bg-brand-600 cursor-pointer disabled:opacity-40 transition-colors">
              .md 다운로드
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
