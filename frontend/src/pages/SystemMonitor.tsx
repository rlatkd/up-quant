import { useState, useEffect } from 'react'
import { getMetrics } from '../api/system'
import PageLoading from '../components/ui/PageLoading'

// 직접 구현한 관측성 계층(캐시·로깅·스로틀)을 한눈에 보는 운영 대시보드. 5초마다 폴링.
function fmtUptime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${h}h ${m}m ${sec}s`
}

function Stat({ label, value, sub = null, accent = null }) {
  return (
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md px-5 py-4">
      <div className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${accent || 'text-gray-800 dark:text-gray-100'}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{sub}</div>}
    </div>
  )
}

function statusColor(s) {
  if (s >= 500) return 'text-red-500'
  if (s >= 400) return 'text-amber-500'
  return 'text-green-600'
}

export default function SystemMonitor() {
  const [data, setData] = useState(null)
  useEffect(() => {
    let alive = true
    const load = () => getMetrics().then(d => { if (alive) setData(d) }).catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (!data) return <PageLoading message="메트릭을 불러오는 중입니다…" />

  const hitColor = data.cache_hit_rate >= 90 ? 'text-green-600' : data.cache_hit_rate >= 60 ? 'text-amber-500' : 'text-red-500'

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">시스템 모니터링</h1>
        <span className="text-xs text-gray-400 dark:text-gray-500">5초마다 자동 갱신 · 가동 {fmtUptime(data.uptime_sec)}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="캐시 적중률" value={data.cache_hit_rate + '%'} accent={hitColor}
          sub={`신선 ${data.cache_hits} · stale ${data.cache_stale_serves} · 콜드 ${data.cache_misses}`} />
        <Stat label="캐시 키 수" value={data.cache_keys} sub="인메모리 보관 항목" />
        <Stat label="업비트 호출" value={data.upbit_calls.toLocaleString()}
          sub={`실패 ${data.upbit_errors}`} accent={data.upbit_errors > 0 ? 'text-amber-500' : undefined} />
        <Stat label="인바운드 요청" value={data.requests.toLocaleString()} sub="프론트→백 누적" />
        <Stat label="평균 응답시간" value={data.avg_response_ms + 'ms'}
          accent={data.avg_response_ms < 50 ? 'text-green-600' : data.avg_response_ms < 200 ? 'text-amber-500' : 'text-red-500'}
          sub="인바운드 처리" />
        <Stat label="가동 시간" value={fmtUptime(data.uptime_sec)} sub="프로세스 시작 이후" />
      </div>

      {/* 외부 소스 헬스 — 환율·뉴스·시총·F&G·체결강도 WS가 며칠째 죽었는지 한눈에(외부 실패를 숨기지 않는 원칙의 운영판) */}
      {data.sources && data.sources.length > 0 && (
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-[#232d40] text-sm font-semibold text-gray-700 dark:text-gray-200">
            외부 소스 상태 <span className="text-xs font-normal text-gray-400 dark:text-gray-500">· 마지막 성공/실패 시각</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#141b29] text-xs text-gray-400 dark:text-gray-500">
                <th className="px-4 py-2 text-left font-medium">소스</th>
                <th className="px-4 py-2 text-left font-medium">상태</th>
                <th className="px-4 py-2 text-right font-medium">성공/실패</th>
                <th className="px-4 py-2 text-right font-medium">마지막 성공</th>
                <th className="px-4 py-2 text-left font-medium">최근 오류</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((s: any) => (
                <tr key={s.name} className="border-t border-gray-50 dark:border-[#232d40]">
                  <td className="px-4 py-1.5 font-medium text-gray-700 dark:text-gray-200">{s.name}</td>
                  <td className="px-4 py-1.5">
                    <span className={`inline-flex items-center gap-1.5 ${s.healthy ? 'text-green-600' : 'text-red-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                      {s.healthy ? '정상' : '실패'}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{s.ok}/{s.fail}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-gray-500 dark:text-gray-400">
                    {s.last_ok_age_sec == null ? '—' : s.last_ok_age_sec < 60 ? `${s.last_ok_age_sec}초 전` : s.last_ok_age_sec < 3600 ? `${Math.floor(s.last_ok_age_sec / 60)}분 전` : `${Math.floor(s.last_ok_age_sec / 3600)}시간 전`}
                  </td>
                  <td className="px-4 py-1.5 text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{s.last_error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-[#232d40] text-sm font-semibold text-gray-700 dark:text-gray-200">
          최근 요청 <span className="text-xs font-normal text-gray-400 dark:text-gray-500">· 상관 ID(rid)로 3계층 로그 추적</span>
        </div>
        {data.recent.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">아직 요청이 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#141b29] text-xs text-gray-400 dark:text-gray-500">
                <th className="px-4 py-2 text-left font-medium">rid</th>
                <th className="px-4 py-2 text-left font-medium">메서드</th>
                <th className="px-4 py-2 text-left font-medium">경로</th>
                <th className="px-4 py-2 text-right font-medium">상태</th>
                <th className="px-4 py-2 text-right font-medium">응답(ms)</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r, i) => (
                <tr key={i} className="border-t border-gray-50 dark:border-[#232d40]">
                  <td className="px-4 py-1.5 font-mono text-xs text-gray-500 dark:text-gray-400">{r.rid}</td>
                  <td className="px-4 py-1.5 text-gray-600 dark:text-gray-300">{r.method}</td>
                  <td className="px-4 py-1.5 text-gray-700 dark:text-gray-200 font-mono text-xs truncate max-w-xs">{r.path}</td>
                  <td className={`px-4 py-1.5 text-right font-medium tabular-nums ${statusColor(r.status)}`}>{r.status}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{r.ms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-400 dark:text-gray-500">
        ※ 외부 의존성 없이 직접 구현한 인메모리 메트릭(프로세스 전역, 단일 인스턴스 전제). 캐시는 SWR+single-flight,
        외부 호출은 전역 스로틀(~초당 8회)+429 백오프 재시도. 적중률이 높을수록 부팅 프리페치 워밍이 잘 동작하는 것.
      </div>
    </div>
  )
}
