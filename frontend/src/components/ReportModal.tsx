import { useState, useEffect, useRef } from 'react'
import { getStrategyReport } from '../api/report'
import PageLoading from './ui/PageLoading'

// LLM 투자 전략 리포트 모달 — 세 종류(시장 개관·포트폴리오 전략·리스크 진단)를 부문별 전용 프롬프트로
// 받아 탭 없이 한 스크롤에 모두 싣고, 모달 디자인 그대로 실제 PDF로 내보낸다.
// 자동 초안 없음 — 생성 실패 시 해당 부문에 오류를 그대로 노출한다.
const TYPES = [
  { key: 'market', label: '시장 개관' },
  { key: 'portfolio', label: '포트폴리오 전략' },
  { key: 'risk', label: '리스크 진단' },
]

// 인라인 마크다운(**굵게**, *기울임*, `코드`) → React 노드.
function renderInline(text: any) {
  const out: any[] = []
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
function Markdown({ text }: any) {
  const lines = text.split('\n')
  const out: any = []
  let list: any = []
  const flush: any = () => {
    if (list.length) { out.push(<ul key={`ul${out.length}`} className="list-disc pl-5 space-y-1 my-2 text-sm text-gray-700 dark:text-gray-200">{list}</ul>); list = [] }
  }
  lines.forEach((ln: any, i: any) => {
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

export default function ReportModal({ onClose }: any) {
  const [reports, setReports] = useState<Record<string, any>>({})   // 성공 결과 { market: data, ... }
  const [errors, setErrors] = useState<Record<string, string>>({})  // 실패 사유 { market: '...' }
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // 세 종류를 병렬로 요청 — 도착하는 대로 채운다(백엔드 종류별 캐시라 재방문은 즉시).
  useEffect(() => {
    let alive = true
    TYPES.forEach(t => getStrategyReport(t.key)
      .then(d => { if (alive) setReports(prev => ({ ...prev, [t.key]: d })) })
      .catch(err => {
        if (alive) setErrors(prev => ({ ...prev, [t.key]: err?.response?.data?.detail || err?.message || '생성 실패' }))
      }))
    return () => { alive = false }
  }, [])

  const allOk = TYPES.every(t => reports[t.key])
  // 부문별 스피너가 따로 돌지 않고, 세 리포트가 모두 끝날(성공·실패) 때까지 하나의 일괄 스피너.
  const allSettled = TYPES.every(t => reports[t.key] || errors[t.key])

  function copy() {
    const md = TYPES.filter(t => reports[t.key]).map(t => reports[t.key].markdown).join('\n\n---\n\n')
    navigator.clipboard?.writeText(md).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }

  // PDF 내보내기 — 렌더된 모달 본문을 그대로 캡처해 실제 PDF로 저장(브라우저 인쇄 아님).
  // jspdf·html2canvas-pro는 동적 import로 코드분할(필요 시에만 로드). 다크모드여도 흰 배경으로 캡처.
  async function exportPdf() {
    const el = contentRef.current
    if (!el || exporting) return
    setExporting(true)
    try {
      const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas-pro'),
      ])
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        onclone: (doc) => doc.documentElement.classList.remove('dark'),  // 항상 라이트 톤으로
      })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pw = pdf.internal.pageSize.getWidth()
      const ph = pdf.internal.pageSize.getHeight()
      const M = 14                                    // 4면 여백(mm)
      const cw = pw - M * 2                           // 콘텐츠 폭
      const ch = ph - M * 2                           // 페이지당 콘텐츠 높이
      const pxPerMm = canvas.width / cw               // 원본 px ↔ mm
      const pageHpx = Math.floor(ch * pxPerMm)        // 한 페이지가 담는 원본 높이(px)
      const pages = Math.max(1, Math.ceil(canvas.height / pageHpx))
      for (let p = 0; p < pages; p++) {               // 원본 캔버스를 페이지 높이로 잘라 각 면에 여백 주고 배치
        if (p > 0) pdf.addPage()
        const sliceH = Math.min(pageHpx, canvas.height - p * pageHpx)
        const tmp = document.createElement('canvas')
        tmp.width = canvas.width
        tmp.height = sliceH
        const ctx = tmp.getContext('2d')!
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, tmp.width, tmp.height)
        ctx.drawImage(canvas, 0, p * pageHpx, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        pdf.addImage(tmp.toDataURL('image/png'), 'PNG', M, M, cw, sliceH / pxPerMm)
      }
      pdf.save('upquant-strategy-report.pdf')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white dark:bg-[#1a2234] rounded-lg shadow-2xl border border-gray-200 dark:border-[#2c3850]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-[#232d40] shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI 전략</span>
            <span className="px-1 py-0.5 rounded bg-[#2e5499] text-white text-[10px] font-bold italic leading-none">βeta</span>
            <span className="text-[10px] text-gray-400">· 시장 개관 · 포트폴리오 전략 · 리스크 진단</span>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 cursor-pointer text-xl leading-none">×</button>
        </div>

        {/* 본문 — 세 리포트를 탭 없이 한 스크롤에 모두 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[240px]">
          {!allSettled ? (
            <PageLoading />
          ) : (
            <div ref={contentRef} className="bg-white dark:bg-[#1a2234] p-2">
              {TYPES.map((t, i) => {
                const d = reports[t.key]
                const err = errors[t.key]
                return (
                  <section key={t.key} className={i > 0 ? 'mt-8 pt-6 border-t border-gray-100 dark:border-[#232d40]' : ''}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">{t.label}</div>
                    {err ? (
                      <div className="my-2 rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5 text-sm text-red-600 dark:text-red-400">
                        <div className="font-medium mb-0.5">생성 실패</div>
                        <div className="text-xs break-words">{err}</div>
                      </div>
                    ) : (
                      // 리포트마다 들어간 면책 한 줄(> 본 리포트는…)은 떼고, 맨 아래 한 번만 보여준다.
                      <Markdown text={d.markdown.replace(/^>\s*본 리포트는[^\n]*$/gm, '').trim()} />
                    )}
                  </section>
                )
              })}
              <div className="mt-8 pt-4 border-t border-gray-100 dark:border-[#232d40] text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                ※ 본 리포트는 정보 제공 목적이며 투자 권유가 아닙니다. 정량 분석은 과거 데이터 기반(생존편향·거래비용 등 한계)이라 미래 수익을 보장하지 않습니다.
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 dark:border-[#232d40] shrink-0">
          <div className="ml-auto flex items-center gap-2">
            <button onClick={copy} disabled={!allOk}
              className="px-3 py-1.5 text-xs rounded border border-gray-200 dark:border-[#2c3850] text-gray-500 dark:text-gray-400 hover:bg-gray-50 cursor-pointer disabled:opacity-40 transition-colors">
              {copied ? '복사됨!' : '전체 복사'}
            </button>
            <button onClick={exportPdf} disabled={!allOk || exporting}
              className="px-3 py-1.5 text-xs rounded bg-brand-500 text-white font-medium hover:bg-brand-600 cursor-pointer disabled:opacity-40 transition-colors">
              {exporting ? 'PDF 생성 중…' : 'PDF 내보내기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
