import { useEffect } from 'react'

// 분석 가이드는 도움말과 별개의 새 창. 경로 이동은 이 창이 아니라 메인(부모) 창을 움직인다.
function goToPage(route: any) {
  if (window.opener && !window.opener.closed) {
    window.opener.location.assign(route)
    window.opener.focus()
  } else {
    window.location.assign(route)
  }
}

// 분석 방법론 · 기술 스택 — 각 정량 분석이 "무엇을 답하나(개념)" + "기법·라이브러리" + "앱 어디서 보나".
// 통계/ML은 검증된 라이브러리, 인프라(SWR 캐시·레이트리밋·요청추적 로깅)는 직접 구현.
const METHODOLOGY = [
  { name: '상관 네트워크 (MST)',        q: '어떤 코인들이 함께 움직이나 — 시장의 중심·허브 종목', how: 'Mantegna 거리 √(2(1−ρ)) + 최소신장트리', lib: 'networkx', where: '시장 구조', route: '/research/structure#network', img: 'network' },
  { name: 'PCA 시장 요인',             q: '시장이 한 덩어리로 동조화된 정도 (PC1 = 공통 시장 요인 ≈ 베타)', how: '표준화 수익률 주성분분석', lib: 'scikit-learn', where: '시장 국면', route: '/research/regime#pca', img: 'pca' },
  { name: 'K-means · 계층 군집',        q: '테마와 무관하게 통계적 성격(변동성·수익·거래대금)이 닮은 종목 묶기', how: 'K-means + 평균연결 덴드로그램', lib: 'scikit-learn · scipy', where: '시장 구조', route: '/research/structure#cluster', img: 'cluster' },
  { name: 'HMM 시장 국면',             q: '시장이 스스로 나눈 평온 / 격동 국면 (변동성 군집성으로 지속)', how: '가우시안 은닉마르코프모델 [수익률·변동성]', lib: 'hmmlearn', where: '시장 국면', route: '/research/regime#regime', img: 'regime' },
  { name: '횡단면 모멘텀 팩터',         q: '오른 종목이 더 오르나 — 모멘텀 효과의 실재 검증', how: '분위 롱숏 달러중립 팩터 백테스트', lib: 'numpy', where: '리서치 › 팩터', route: '/research/factor#momentum', img: 'momentum' },
  { name: '공적분 페어트레이딩',        q: '장기적으로 같이 움직이는 두 코인의 평균회귀 기회', how: 'Engle-Granger 공적분 + BH-FDR 다중검정 보정 + 스프레드 z점수', lib: 'statsmodels', where: '리서치 › 팩터', route: '/research/factor#pairs', img: 'pairs' },
  { name: 'Markowitz 효율적 경계선',    q: '위험 대비 수익이 최적인 포트폴리오 비중', how: '평균-분산 최적화 (★최대샤프 / ◆최소분산)', lib: 'scipy SLSQP', where: '포트폴리오 › 최적화', route: '/strategy/portfolio', img: 'markowitz' },
  { name: 'GARCH 변동성 예측 + VaR',   q: '변동성 군집성·향후 변동성·1일 예상 최대손실(VaR)', how: 'GARCH(1,1) 조건부 변동성', lib: 'arch', where: '코인 상세', route: '/coins', img: 'garch' },
]

export default function Guide() {
  useEffect(() => {
    document.title = '분석 가이드'
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#141b29]">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* 인트로 */}
        <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-6">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1.5">분석 가이드 · 방법론</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            UPquant이 제공하는 정량 분석이 각각 <span className="font-medium text-gray-700 dark:text-gray-200">무엇을 답하는지(개념)</span>와
            사용한 <span className="font-medium text-gray-700 dark:text-gray-200">기법·라이브러리</span>를 정리했습니다.
            시세는 업비트 Open API 실연동이며, 통계·머신러닝은 검증된 라이브러리(numpy·scipy·scikit-learn·statsmodels·arch·hmmlearn·networkx)로,
            성능·관측성 인프라(인메모리 SWR 캐시·레이트리밋·요청 단위 추적 로깅)는 직접 구현했습니다.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">※ 각 항목의 [열기 ↗] 버튼을 누르면 메인 창이 해당 분석 화면으로 이동합니다. 아래 이미지는 실제 분석 화면을 캡처한 것이며, 클릭하면 원본 크기로 열립니다.</p>
        </div>

        {/* 방법론 카드 */}
        {METHODOLOGY.map(m => (
          <div key={m.name} className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-base font-bold text-gray-800 dark:text-gray-100">{m.name}</span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-brand-50 text-brand-600">{m.lib}</span>
              <button
                type="button"
                onClick={() => goToPage(m.route)}
                title="메인 창에서 이 분석 열기"
                className="ml-auto text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded hover:bg-brand-100 transition-colors cursor-pointer"
              >
                {m.where}에서 열기 ↗
              </button>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{m.q}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">방법 · {m.how}</div>
            {/* 실제 앱 화면 캡처 (public/guide/*.png) — 클릭 시 원본 크기로 새 탭 */}
            <a href={`/guide/${m.img}.png`} target="_blank" rel="noopener noreferrer"
              className="block mt-3 rounded-md border border-gray-200 dark:border-[#2c3850] overflow-hidden hover:border-brand-400 transition-colors">
              <img src={`/guide/${m.img}.png`} alt={`${m.name} 실제 화면`} loading="lazy" className="w-full block" />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
