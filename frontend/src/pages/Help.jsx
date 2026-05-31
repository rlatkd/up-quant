import { useEffect } from 'react'

// 도움말은 새 창이므로, 경로 이동은 이 창이 아니라 메인(부모) 창을 움직인다.
function goToPage(route) {
  if (window.opener && !window.opener.closed) {
    window.opener.location.assign(route)
    window.opener.focus()
  } else {
    window.location.assign(route)
  }
}

// 동작 유형 태그
function Tag({ tone, children }) {
  const tones = {
    nav:    'bg-brand-50 text-brand-600',   // 클릭 시 페이지 이동
    action: 'bg-emerald-50 text-emerald-600', // 화면 내 동작 (토글/필터/실행)
    info:   'bg-gray-100 text-gray-500',      // 정적 표시 (클릭 동작 없음)
  }
  return (
    <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

// 페이지별 기능 가이드
const GUIDE = [
  {
    route: '/',
    title: '대시보드',
    summary: '시장 전체를 한눈에 보고, "오늘의 시그널"로 의사결정을 시작합니다.',
    features: [
      { tone: 'action', name: '오늘의 시그널 (Opportunity Feed)', desc: '최상단의 4-카드 시그널 모음 — ⑴52주 신고/신저 경신 ⑵급등(+2% 이상) ⑶안정 상승 모멘텀(1개월 +5%·변동성 5% 이하·수익/변동성 비율 상위) ⑷섹터 로테이션(이번달 vs 지난달 변화 큰 섹터). 종목 칩 클릭 시 상세 이동, + 버튼으로 분석 카트 담기, 각 카드 우상단 링크로 해당 분석 페이지 진입.' },
      { tone: 'info',   name: 'KPI 카드 4개', desc: '24h 총 거래대금 · 상승 코인 비율 · BTC 도미넌스 · 시장 평균 등락률을 표시합니다. 클릭 동작은 없습니다.' },
      { tone: 'info',   name: '공포·탐욕 지수', desc: '상승비율(60%)과 평균 등락률(40%)을 합산한 0~100 점수의 반원 게이지입니다. 파랑(공포) → 회색(중립) → 빨강(탐욕)으로 시장 심리를 나타냅니다.' },
      { tone: 'info',   name: '시장 지배력', desc: 'BTC·ETH·XRP·SOL과 기타의 24h 거래대금 비중을 도넛 차트로 보여줍니다.' },
      { tone: 'info',   name: '급등 · 급락 피드', desc: '등락률 상위 5종목(급등)과 하위 5종목(급락)을 나열합니다. 표시 전용입니다.' },
    ],
  },
  {
    route: '/sectors',
    title: '섹터 분석',
    summary: '업비트 분류(섹터) 기준 수익률·상관관계를 봅니다. (종목 리스크-수익 분포는 [마켓 현황]으로 이동)',
    features: [
      { tone: 'action', name: '섹터 안내', desc: '업비트 데이터랩 ‘코인 분류’ 대분류 5개 섹터의 한 줄 설명입니다. 섹터를 클릭하면 소속 종목 리스트(현재가·등락·1개월 수익률·거래대금) 모달이 뜨고, 행 클릭으로 코인 상세 이동·＋버튼으로 분석 카트 담기가 가능합니다.' },
      { tone: 'action', name: '카테고리별 누적 수익률', desc: '우상단 [월 / 분기 / 년] 버튼으로 기간 단위를 바꿉니다. 섹터별 누적 등락률 곡선이며, 우측 [세로 확대] 버튼으로 세로 배율을 키워 라인 간격을 벌릴 수 있습니다.' },
      { tone: 'info',   name: '월별 카테고리 수익률', desc: '각 섹터 소속 종목의 월 평균 등락률(%) 히트맵입니다. 빨강=상승, 파랑=하락, 진할수록 폭이 큽니다.' },
      { tone: 'info',   name: '카테고리 상관관계', desc: '섹터 간 월별 수익률의 피어슨 상관계수(-1~+1) 히트맵입니다. 색은 표 안에서의 상대 강도입니다.' },
    ],
  },
  {
    route: '/market',
    title: '마켓 현황',
    summary: '거래대금·등락률 중심으로 시장 상황을 살펴봅니다.',
    features: [
      { tone: 'nav',  name: '주요 종목 카드 (BTC·ETH·XRP·SOL)', desc: '미니 차트와 함께 표시되며, 카드를 클릭하면 해당 코인 상세 페이지로 이동합니다.' },
      { tone: 'nav',  name: '52주 신고가 / 신저가 배지', desc: '오늘 52주 최고가/최저가를 경신한 종목 배지입니다(신고가 빨강·신저가 파랑). 노이즈를 줄이려 거래대금 상위 30종만 표시하며, 배지를 클릭하면 상세 페이지로 이동합니다.' },
      { tone: 'nav',  name: '상승률 상위 / 하락률 상위 테이블', desc: '각각 상위 10종목을 표시합니다. 행을 클릭하면 상세 페이지로 이동합니다.' },
      { tone: 'nav',  name: '거래대금 상위 테이블', desc: '24h 거래대금 상위 10종목을 표로 표시합니다. 행을 클릭하면 상세 페이지로 이동합니다.' },
      { tone: 'info', name: '시장 현황 트리맵', desc: '사각형 크기 = 거래대금, 색상 = 등락(빨강 상승 / 파랑 하락, 진할수록 변동 큼). 표시 전용입니다.' },
      { tone: 'info', name: '리스크-수익 분포', desc: '거래대금 상위 100종을 변동성(X) × 1개월 수익률(Y) 산점도로 표시합니다. 점 색상 = 1개월 수익률. 분포 본체 밖 극단값은 아래 표로 분리되며 행 클릭 시 상세로 이동합니다.' },
    ],
  },
  {
    route: '/coins',
    title: '코인 목록',
    summary: '전체 종목을 표로 보고 정렬·검색·즐겨찾기할 수 있습니다.',
    features: [
      { tone: 'info',   name: '시장 요약 카드', desc: '24h 총 거래대금 · 상승 종목 수 · 하락 종목 수 · BTC 도미넌스를 표시합니다.' },
      { tone: 'action', name: '필터 탭', desc: '[전체 / 즐겨찾기 / 상승 / 하락 / 보합] 중 하나를 눌러 목록을 거릅니다.' },
      { tone: 'action', name: '종목 검색창', desc: '한글명 또는 심볼(예: BTC)을 입력하면 실시간으로 필터링됩니다.' },
      { tone: 'action', name: '컬럼 정렬 (종목명·현재가·24h등락·거래대금)', desc: '헤더를 클릭할 때마다 내림차순(↓) → 오름차순(↑) → 정렬 해제(↕) 순으로 3단계 순환합니다.' },
      { tone: 'action', name: '별 아이콘 (즐겨찾기)', desc: '별을 클릭하면 즐겨찾기에 추가/해제됩니다. 브라우저(localStorage)에 저장되어 새로고침해도 유지됩니다.' },
      { tone: 'info',   name: '1일 스파크라인 / 52주 위치 바', desc: '최근 24시간(1시간봉) 추세 선과, 52주 최저~최고가 대비 현재 위치(%)를 막대로 표시합니다.' },
      { tone: 'nav',    name: '행(Row) 클릭', desc: '별 아이콘을 제외한 행 어디든 클릭하면 해당 코인 상세 페이지로 이동합니다.' },
    ],
  },
  {
    route: '/coins/KRW-BTC',
    routeLabel: '/coins/:market',
    title: '코인 상세',
    summary: '개별 코인의 시세·차트·호가·체결·상관관계를 봅니다. (목록/마켓에서 종목을 클릭하면 진입)',
    features: [
      { tone: 'info',   name: '상단 가격 정보', desc: '현재가, 등락(▲/▼), 고가·저가·전일종가·거래대금을 표시합니다.' },
      { tone: 'action', name: '시간 단위 탭', desc: '1분 / 3분 / … / 1시간 / 4시간 / 일 / 주 / 월 중 선택하면 캔들 차트의 봉 단위가 바뀝니다. (기본값: 일)' },
      { tone: 'action', name: '지표 토글 (MA / Bollinger / RSI)', desc: '버튼을 켜고 끄면 차트에 지표가 겹쳐집니다. MA=이동평균(20·60), Bollinger=볼린저 밴드, RSI=별도 보조 차트가 차트 아래에 나타납니다.' },
      { tone: 'info',   name: '호가창', desc: '매도호가(파랑)·매수호가(빨강)와 잔량을 막대로 표시합니다.' },
      { tone: 'info',   name: '체결 내역 / 종목 정보', desc: '최근 체결 목록(매수=빨강, 매도=파랑)과 종목 기본 정보 테이블입니다.' },
      { tone: 'info',   name: '타 종목 상관관계', desc: '60일 일봉 종가 기준 다른 14개 종목과의 피어슨 상관계수를 색상 카드로 보여줍니다. 빨강=함께 움직임, 파랑=반대로 움직임.' },
    ],
  },
  {
    route: '/tools?tab=compare',
    title: '비교 분석 (도구 → 비교)',
    summary: '여러 코인의 수익률을 같은 출발선에서 겹쳐 비교합니다.',
    features: [
      { tone: 'action', name: '종목 선택 (Pill 버튼)', desc: '코인 버튼을 클릭해 최대 5개까지 선택/해제합니다. 선택하면 고유 색이 배정됩니다.' },
      { tone: 'info',   name: '수익률 비교 차트', desc: '선택한 코인들의 90일간 누적 등락률을 초기값 대비 %로 정규화해 한 차트에 겹쳐 그립니다.' },
      { tone: 'info',   name: '통계 카드', desc: '종목별 90일 수익률 · 최고 수익률 · 최저 수익률을 카드로 요약합니다.' },
    ],
  },
  {
    route: '/tools?tab=backtest',
    title: '전략 백테스트 (도구 → 백테스트)',
    summary: '과거 데이터로 매매 전략의 성과를 시뮬레이션합니다.',
    features: [
      { tone: 'action', name: '전략 선택', desc: '[MA 크로스] 또는 [RSI 역추세] 중 선택합니다. 선택에 따라 아래 입력 항목이 바뀝니다.' },
      { tone: 'action', name: '종목 / 파라미터 입력', desc: 'MA 크로스는 단기·장기 이동평균, RSI 역추세는 기간·과매도·과매수 값을 입력합니다. 데이터 기간(일봉 60~500개)도 지정합니다.' },
      { tone: 'action', name: '[백테스트 실행] 버튼', desc: '입력한 조건으로 시뮬레이션을 돌려 아래에 결과를 표시합니다.' },
      { tone: 'info',   name: '결과: 성과 지표', desc: '총 수익률 · 최대 낙폭(MDD) · 승률 · 총 거래 횟수 4개 카드.' },
      { tone: 'info',   name: '결과: 자산 곡선 / 거래별 손익 / 거래 내역', desc: '초기자본 100 기준 자산 변화 곡선, 매도별 손익률 막대(이익=빨강/손실=파랑), 전체 매매 기록 표입니다.' },
    ],
  },
  {
    route: '/screener',
    title: '코인 스크리너',
    summary: '원하는 조건을 만족하는 코인만 걸러냅니다.',
    features: [
      { tone: 'action', name: '프리셋 버튼', desc: '[급등주 / 고변동성 / 52주 신고가 근접 / 침체 저가권]을 누르면 자주 쓰는 조건이 자동 입력됩니다.' },
      { tone: 'action', name: '조건 추가 / 삭제', desc: '[+ 조건 추가]로 행을 늘리고, 각 행에서 항목(등락률·거래대금·변동성·1개월 수익률·52주 위치) · 연산자(>, <, >=, <=) · 값을 지정합니다. × 버튼으로 행을 제거합니다.' },
      { tone: 'action', name: '[스크리닝 실행] / [초기화]', desc: '실행을 누르면 모든 조건을 동시에 만족하는 종목만 표로 나옵니다. 초기화는 조건과 결과를 모두 지웁니다.' },
      { tone: 'nav',    name: '결과 행 클릭', desc: '결과 표의 종목을 클릭하면 해당 코인 상세 페이지로 이동합니다.' },
    ],
  },
]

const COLOR_RULES = [
  { color: 'bg-red-500',  label: '빨강 = 상승 / 매수 / 양(+)' },
  { color: 'bg-blue-500', label: '파랑 = 하락 / 매도 / 음(−)' },
  { color: 'bg-gray-400', label: '회색 = 보합 / 중립' },
]

function Section({ item }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-bold text-gray-800">{item.title}</h2>
        <button
          type="button"
          onClick={() => goToPage(item.route)}
          title="메인 창에서 이 페이지 열기"
          className="text-xs font-mono text-brand-500 bg-brand-50 px-2 py-0.5 rounded hover:bg-brand-100 transition-colors cursor-pointer"
        >
          {item.routeLabel || item.route} ↗
        </button>
        <span className="text-xs text-gray-400">{item.summary}</span>
      </div>
      <ul className="divide-y divide-gray-50">
        {item.features.map((f, i) => (
          <li key={i} className="px-5 py-3 flex gap-3">
            <div className="pt-0.5 flex-shrink-0">
              <Tag tone={f.tone}>
                {f.tone === 'nav' ? '이동' : f.tone === 'action' ? '동작' : '표시'}
              </Tag>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800">{f.name}</div>
              <div className="text-sm text-gray-500 mt-0.5 leading-relaxed">{f.desc}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Help() {
  useEffect(() => {
    document.title = '도움말'
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {/* 인트로 */}
      <div className="bg-white border border-gray-200 rounded-md p-6">
        <h1 className="text-lg font-bold text-gray-800 mb-1.5">사용 설명서</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          UPquant의 모든 페이지와 기능, 그리고 클릭 시 일어나는 동작을 정리한 안내서입니다.
          각 기능 앞의 태그로 동작 유형을 구분합니다.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="flex items-center gap-1.5">
            <Tag tone="nav">이동</Tag>
            <span className="text-xs text-gray-500">클릭 시 다른 페이지로 이동</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Tag tone="action">동작</Tag>
            <span className="text-xs text-gray-500">화면 안에서 토글·필터·실행</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Tag tone="info">표시</Tag>
            <span className="text-xs text-gray-500">정보 표시 전용 (클릭 동작 없음)</span>
          </div>
        </div>
      </div>

      {/* 기본 규칙 */}
      <div className="bg-white border border-gray-200 rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 mb-3">기본 규칙</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {COLOR_RULES.map(r => (
            <div key={r.label} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${r.color}`} />
              <span className="text-sm text-gray-600">{r.label}</span>
            </div>
          ))}
        </div>
        <ul className="text-sm text-gray-500 space-y-1.5 list-disc pl-5 leading-relaxed">
          <li>국내 거래소 관례를 따라 <span className="text-red-500 font-medium">상승은 빨강</span>, <span className="text-blue-500 font-medium">하락은 파랑</span>입니다.</li>
          <li>마우스 커서가 손 모양으로 바뀌는 요소는 클릭할 수 있습니다.</li>
          <li>이 설명서는 별도 창이라, 메인 화면 옆에 두고 보면서 사용할 수 있습니다.</li>
          <li>각 항목의 <span className="font-mono text-brand-500">경로 ↗</span>를 누르면 <span className="font-medium">메인 창</span>이 해당 페이지로 이동합니다.</li>
          <li>모든 데이터는 업비트 시세 Open API에서 실시간으로 받아옵니다(인증 불필요). 카테고리 분류는 업비트 데이터랩 '코인 분류' 기준입니다.</li>
        </ul>
      </div>

        {/* 페이지별 가이드 */}
        {GUIDE.map(item => <Section key={item.route} item={item} />)}
      </div>
    </div>
  )
}
