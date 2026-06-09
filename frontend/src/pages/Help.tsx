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
    info:   'bg-gray-100 dark:bg-[#222c3e] text-gray-500 dark:text-gray-400',      // 정적 표시 (클릭 동작 없음)
  }
  return (
    <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 rounded text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

// 페이지별 기능 가이드 — 헤더(시황 · 마켓 · 리서치 · 포트폴리오) 순서에 맞춤.
const GUIDE = [
  {
    route: '/dashboard',
    title: '시황 (대시보드)',
    summary: '업비트 "코인동향"을 본떠 시장 전체를 발견·지수 중심으로 한눈에 봅니다.',
    features: [
      { tone: 'action', name: '시장 지수 6카드 + 당일/전일 인트라데이', desc: '자체 동일가중 지수 6종(종합·알트·비트코인 그룹·이더리움 그룹·상위10·상위30). 우상단 [당일/전일] 토글로 60분봉 기반 인트라데이 라인을 전환합니다. 공식 UBMI는 비공개라 자체 동일가중으로 대체합니다.' },
      { tone: 'nav',    name: '주간 상승 TOP 10', desc: '최근 1주 수익률 상위 10종 레일. 클릭하면 해당 코인 상세로 이동합니다.' },
      { tone: 'info',   name: '오늘의 환율', desc: 'USD·JPY·CNY·EUR / KRW 환율(외부 무료 FX 소스, 10분 캐시). 소스 실패 시 "소스 교체 필요"를 표시합니다.' },
      { tone: 'info',   name: '오늘의 시황', desc: '상승/하락 종목 수·평균 등락·BTC 지배력·총 거래대금을 한 줄로 자체 요약합니다.' },
      { tone: 'nav',    name: '랭킹 그리드', desc: '주간 상승·급상승·급하락·거래량 급증·체결강도(매수/매도 우위) 5~6종 랭킹. 체결강도는 업비트 WS의 누적 매수/매도량 기준입니다. 행 클릭 시 상세로 이동합니다.' },
      { tone: 'nav',    name: '최신 뉴스', desc: '한국 크립토 RSS 통합(헤드라인+링크, 외부 소스). ‹ › 로 페이지를 넘기고, 클릭 시 원문이 새 탭으로 열립니다.' },
      { tone: 'action', name: '디지털 자산 표 (기간별 / 시가총액)', desc: '[기간별 상승률]은 1주~1년 수익률, [시가총액]은 외부(CoinGecko) 시총 기준입니다. 기간 헤더를 클릭하면 그 기간으로 정렬됩니다. 행 클릭 시 상세로 이동합니다.' },
      { tone: 'action', name: '디지털 자산 지수 표 (시장/전략/테마/섹터)', desc: '탭별 자체 동일가중 지수와 전일대비·1개월·3개월 수익률. 행 클릭 시 관련 분석 페이지로 이동합니다.' },
    ],
  },
  {
    route: '/market',
    title: '시장 현황 (마켓)',
    summary: '거래대금·등락률 중심으로 시장 상황을 살펴봅니다.',
    features: [
      { tone: 'info', name: '시장 요약 스트립', desc: '24h 총 거래대금·평균 등락률·상승/하락 종목 수·52주 신고/신저·거래대금 집중도·공포탐욕 지수를 한 줄로 응집합니다.' },
      { tone: 'nav',  name: '주요 종목 카드 (거래대금 상위 4)', desc: '미니 차트와 실시간 가격(WS). 카드를 클릭하면 해당 코인 상세로 이동합니다.' },
      { tone: 'nav',  name: '52주 신고가 / 신저가 배지', desc: '오늘 52주 최고/최저를 경신한 종목(신고가 빨강·신저가 파랑). 노이즈를 줄이려 거래대금 상위 30종만 표시하며, 클릭 시 상세로 이동합니다.' },
      { tone: 'nav',  name: '상승률 / 하락률 / 거래대금 상위 표', desc: '각 상위 10종. 현재가·등락률은 실시간(WS)으로 갱신되고, 행 클릭 시 상세로 이동합니다.' },
      { tone: 'info', name: '거래대금 비중 트리맵', desc: '사각형 크기 = 거래대금, 색 = 등락(빨강 상승/파랑 하락, 진할수록 변동 큼). 거래대금 상위 30종입니다.' },
      { tone: 'info', name: 'Advance-Decline(시장 폭) 라인', desc: '거래대금 상위 100종의 (상승−하락) 누적선과 동일가중 시장지수를 겹쳐, 지수 상승이 다수 종목에 동반되는지(시장 폭)를 봅니다.' },
      { tone: 'nav',  name: '리스크-수익 분포', desc: '거래대금 상위 100종을 변동성(X)×1개월 수익률(Y) 산점도로. 점 색 = 1개월 수익률. 분포 밖 극단값은 아래 표로 분리되며 행 클릭 시 상세로 이동합니다.' },
    ],
  },
  {
    route: '/sectors',
    title: '섹터 (마켓)',
    summary: '업비트 데이터랩 분류(섹터) 기준 수익률·상관관계를 봅니다.',
    features: [
      { tone: 'action', name: '섹터 안내 카드', desc: '대분류 5개 섹터의 한 줄 설명. 섹터를 클릭하면 소속 종목(현재가·등락·1개월 수익률·거래대금) 모달이 뜨고, 행 클릭으로 상세 이동이 가능합니다.' },
      { tone: 'info',   name: '카테고리 누적 수익률', desc: '섹터별 소속 종목의 일봉 동일가중 지수(첫날=0%)를 누적 등락률로 그립니다. 모든 섹터가 같은 날짜축을 공유합니다.' },
      { tone: 'info',   name: '월별 카테고리 수익률 히트맵', desc: '섹터별 월 평균 등락률(%). 빨강=상승, 파랑=하락, 진할수록 폭이 큽니다.' },
      { tone: 'info',   name: '카테고리 상관관계', desc: '섹터 간 월별 수익률의 피어슨 상관계수 히트맵(표 안에서의 상대 강도).' },
    ],
  },
  {
    route: '/screener',
    title: '스크리너 (마켓)',
    summary: '전체 시장에서 조건을 만족하는 종목을 걸러냅니다(발굴).',
    features: [
      { tone: 'action', name: '프리셋 버튼', desc: '[급등주 / 고변동성 / 거래량 급증 / 고베타 / 52주 신고가 근접 / 침체 저가권] 등 자주 쓰는 조건을 한 번에 채웁니다.' },
      { tone: 'action', name: '조건 추가 / 삭제', desc: '항목(등락률·거래대금·변동성·1개월 수익률·52주 위치·BTC 베타·거래량 급증·변동성 z) · 연산자(>, <, >=, <=) · 값을 지정합니다. 모든 조건을 동시에 만족하는 종목만 결과로 나옵니다.' },
      { tone: 'action', name: '스크리닝 실행 / 초기화', desc: '실행하면 결과 표가 나오고, 초기화는 조건과 결과를 모두 지웁니다.' },
      { tone: 'nav',    name: '결과 행 클릭', desc: '결과 종목을 클릭하면 해당 코인 상세로 이동합니다.' },
    ],
  },
  {
    route: '/coins',
    title: '코인 목록 (로고 · 메인)',
    summary: '좌측 코인 상세 + 우측 종목 리스트의 마스터-디테일 화면입니다.',
    features: [
      { tone: 'action', name: '종목 검색 / 필터 탭', desc: '한글명·심볼 검색과 [전체 / 즐겨찾기 / 상승 / 하락 / 보합] 필터로 우측 리스트를 거릅니다.' },
      { tone: 'action', name: '컬럼 정렬 · 즐겨찾기(★)', desc: '헤더 클릭으로 정렬(내림↓→오름↑→해제)하고, ★로 즐겨찾기에 추가/해제합니다(localStorage 저장). 기본 정렬은 거래대금 내림차순입니다.' },
      { tone: 'info',   name: '실시간 가격 / 등락', desc: '리스트의 현재가·등락률은 WebSocket으로 실시간 갱신되며, 변동 순간 빨강/파랑으로 깜빡입니다.' },
      { tone: 'nav',    name: '행 클릭', desc: '종목을 클릭하면 좌측 상세가 그 종목으로 바뀝니다(주소도 /coins/심볼 로 갱신).' },
    ],
  },
  {
    route: '/coins/KRW-BTC',
    routeLabel: '/coins/:market',
    title: '코인 상세',
    summary: '개별 코인의 시세·차트·호가·체결·지표·상관관계를 봅니다.',
    features: [
      { tone: 'info',   name: '상단 가격 헤더 (실시간)', desc: '현재가·등락은 WebSocket으로 실시간 갱신되고 변동 순간 깜빡입니다. 고가·저가·전일종가·24h 거래대금을 함께 표시합니다.' },
      { tone: 'info',   name: '주요 지표', desc: '거래대금 순위·30일 변동성·1개월 수익률·시장 점유율·BTC 베타·GARCH 연변동성·1일 95% VaR(정규근사+경험 VaR/CVaR)를 한 줄로 보여줍니다.' },
      { tone: 'info',   name: '52주 위치 바', desc: '52주 최저~최고가 대비 현재가 위치(%)와 오늘 신고/신저 경신 배지.' },
      { tone: 'action', name: '시간 단위 탭', desc: '1분~월 중 선택하면 캔들 차트의 봉 단위가 바뀝니다(기본: 일).' },
      { tone: 'action', name: '지표 토글', desc: 'MA(20·60)·볼린저밴드·VWAP·거래량대(Volume Profile)·RSI를 켜고 끕니다. RSI는 차트 아래 보조 패널로 나타납니다.' },
      { tone: 'info',   name: '호가창 (실시간)', desc: '매도(파랑)·매수(빨강) 호가와 잔량 막대를 WebSocket으로 실시간 표시하고, 상단에 매수/매도 잔량 압력 비율을 보여줍니다.' },
      { tone: 'info',   name: '체결 내역 (실시간)', desc: '최근 체결(매수=빨강/매도=파랑)이 실시간으로 맨 위에 쌓입니다.' },
      { tone: 'nav',    name: '타 종목 상관관계', desc: '60일 일봉 종가 피어슨 상관계수로 함께 움직이는(동조) 7종과 반대로 움직이는(헤지 후보) 7종을 보여줍니다. [전체 상관 네트워크 →]로 시장 구조 페이지로 이동합니다.' },
    ],
  },
  {
    route: '/structure',
    title: '시장 구조 (리서치)',
    summary: '종목 간 관계와 구조 — 상관 네트워크와 통계적 군집.',
    features: [
      { tone: 'info', name: '상관 네트워크 (MST)', desc: 'Mantegna 거리 √(2(1−ρ))로 최소신장트리를 만들어 시장의 중심·허브 종목과 종목 간 위계를 보여줍니다.' },
      { tone: 'info', name: 'K-means · 계층 군집', desc: '섹터와 무관하게 통계적 성격(변동성·수익률·거래대금)이 닮은 종목을 K-means로 묶고, 평균연결 덴드로그램으로 위계를 보여줍니다.' },
    ],
  },
  {
    route: '/regime',
    title: '시장 국면 (리서치)',
    summary: '시장 전체의 상태 — PCA 공통요인과 HMM 국면.',
    features: [
      { tone: 'info', name: 'PCA 시장 요인', desc: '표준화 수익률 주성분분석. 제1주성분(PC1)이 공통 시장 요인이며, 종목별 로딩은 시장요인 동조도(≈베타)입니다. 설명비율이 높을수록 시장이 한 덩어리로 움직였다는 뜻입니다.' },
      { tone: 'info', name: 'HMM 시장 국면', desc: '동일가중 시장지수의 [수익률·변동성]에 가우시안 은닉마르코프모델을 적합해 평온/격동 국면을 데이터가 스스로 나눕니다. 현재 국면과 국면별 통계를 표시합니다.' },
    ],
  },
  {
    route: '/factor',
    title: '팩터 (리서치)',
    summary: '시장 전체에서 팩터가 실재하는지 관찰 — 모멘텀·공적분 페어.',
    features: [
      { tone: 'action', name: '횡단면 모멘텀 (롱숏 / 롱온리 토글)', desc: '과거 20일 수익률 상위 20%를 롱. [롱숏]은 하위 20%를 숏하는 달러중립(공매도 가정 — 업비트 현물 실행 불가, 학술 검증용), [롱온리]는 상위만 매수(현물 실행 가능)입니다. 거래비용을 차감하고 동일가중 매수보유와 비교합니다.' },
      { tone: 'info',   name: '공적분 페어트레이딩', desc: 'Engle-Granger 검정(p<0.05) 공적분 페어를 찾습니다. 헤지비율 β는 형성기간(앞 절반)으로 추정하고 거래기간(뒤 절반)만 매매하는 out-of-sample 사후검증으로 과거 성과를 요약합니다.' },
    ],
  },
  {
    route: '/risk',
    title: '리스크 (리서치)',
    summary: '전 종목의 위험을 한눈에 — 변동성 분포와 VaR.',
    features: [
      { tone: 'info', name: '리스크-수익 분포', desc: '변동성×1개월 수익률 산점도(거래대금 상위 120종).' },
      { tone: 'info', name: '변동성 분포', desc: '전 종목 일변동성 히스토그램.' },
      { tone: 'info', name: 'VaR 랭킹', desc: '정규근사 1일 95% VaR(=1.645×일변동성) 랭킹. 꼬리위험은 과소평가될 수 있는 정규근사입니다.' },
    ],
  },
  {
    route: '/tools/portfolio',
    title: '최적화 (전략)',
    summary: '위험 대비 수익이 최적인 포트폴리오 비중을 찾습니다.',
    features: [
      { tone: 'info', name: 'Markowitz 효율적 경계선 + 자본배분선(CAL)', desc: '평균-분산 최적화로 ★최대샤프·◆최소분산 비중과 효율적 경계선 곡선, 무위험수익률에서 접점으로 긋는 CAL을 그립니다. 공분산은 Ledoit-Wolf 수축, 리스크 패리티(역변동성) 비중도 제시합니다.' },
      { tone: 'action', name: '목표수익률 슬라이더 · 상관행렬 · 리스크 기여도', desc: '슬라이더로 경계선 위를 움직이며 비중을 보고, 선택 바스켓의 상관행렬(분산효과 근원)·자산 통계·각 비중의 리스크 기여도(비중≠리스크)를 함께 봅니다.' },
      { tone: 'nav',  name: '이 비중으로 백테스트 →', desc: '최적 비중을 백테스트 페이지로 넘겨 포트폴리오 보유 성과를 검증합니다.' },
    ],
  },
  {
    route: '/tools/backtest',
    title: '백테스트 (전략)',
    summary: '실제 매매 전략을 과거 데이터로 시뮬레이션합니다(전략 실행).',
    features: [
      { tone: 'action', name: '전략 선택', desc: 'MA 크로스·RSI 역추세·추세추종(TSMOM)·포트폴리오 보유 중 선택합니다. 같은 입력(종목·기간·비용)을 공유하며 전략만 바꿔 비교하는 기능적 선택입니다.' },
      { tone: 'action', name: '종목 / 파라미터 입력 · 실행', desc: '종목·기간·파라미터·거래비용(bps)을 지정해 시뮬레이션합니다. 익일 체결로 룩어헤드를 제거하고 유동성 슬리피지를 반영합니다.' },
      { tone: 'info',   name: '결과', desc: '자산 곡선 + 매수보유·BTC 벤치마크, 총수익률·MDD·샤프/소르티노/칼마·승률 등을 표시합니다.' },
    ],
  },
  {
    route: '/tools/validation',
    title: '검증 · 시뮬레이션 (전략)',
    summary: '전략의 강건성·전망을 점검합니다(과최적화·미래 분포).',
    features: [
      { tone: 'action', name: '전략 비교', desc: '한 종목에 MA 크로스·RSI 역추세를 동시에 돌려 자산 곡선을 겹쳐 비교합니다.' },
      { tone: 'action', name: '워크포워드', desc: '전체 기간을 분할해 직전 구간(in-sample)에서 MA 파라미터를 그리드서치로 고르고, 그 다음 구간(out-of-sample)에서만 성과를 집계합니다. 구간별 선택 파라미터·OOS 수익률·과최적화 p값을 표시합니다.' },
      { tone: 'action', name: '몬테카를로', desc: '과거 일간수익률을 부트스트랩해 향후 경로 1,000개를 생성, 백분위 부채꼴과 손실확률을 보여줍니다.' },
    ],
  },
  {
    route: '/tools/compare',
    title: '종목 비교 (리서치)',
    summary: '여러 코인의 수익률을 같은 출발선에서 겹쳐 비교합니다.',
    features: [
      { tone: 'action', name: '종목 선택', desc: '코인을 최대 5개까지 선택/해제하면 각 종목에 고유 색이 배정됩니다.' },
      { tone: 'info',   name: '수익률 비교 차트', desc: '선택 종목의 일정 기간 누적 등락률을 초기값 대비 %로 정규화해 한 차트에 겹쳐 그립니다.' },
      { tone: 'action', name: '공유 링크', desc: '선택한 종목 조합을 URL(?markets=)로 인코딩해 공유할 수 있습니다.' },
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
    <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-[#232d40] flex items-center gap-3 flex-wrap">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{item.title}</h2>
        <button
          type="button"
          onClick={() => goToPage(item.route)}
          title="메인 창에서 이 페이지 열기"
          className="text-xs font-mono text-brand-500 bg-brand-50 px-2 py-0.5 rounded hover:bg-brand-100 transition-colors cursor-pointer"
        >
          {item.routeLabel || item.route} ↗
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500">{item.summary}</span>
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
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{f.name}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{f.desc}</div>
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
    <div className="min-h-screen bg-gray-50 dark:bg-[#141b29]">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      {/* 인트로 */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-6">
        <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-1.5">사용 설명서</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
          UPquant의 모든 페이지와 기능, 그리고 클릭 시 일어나는 동작을 정리한 안내서입니다.
          각 기능 앞의 태그로 동작 유형을 구분합니다.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="flex items-center gap-1.5">
            <Tag tone="nav">이동</Tag>
            <span className="text-xs text-gray-500 dark:text-gray-400">클릭 시 다른 페이지로 이동</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Tag tone="action">동작</Tag>
            <span className="text-xs text-gray-500 dark:text-gray-400">화면 안에서 토글·필터·실행</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Tag tone="info">표시</Tag>
            <span className="text-xs text-gray-500 dark:text-gray-400">정보 표시 전용 (클릭 동작 없음)</span>
          </div>
        </div>
      </div>

      {/* 기본 규칙 */}
      <div className="bg-white dark:bg-[#1a2234] border border-gray-200 dark:border-[#2c3850] rounded-md p-5">
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">기본 규칙</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {COLOR_RULES.map(r => (
            <div key={r.label} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${r.color}`} />
              <span className="text-sm text-gray-600 dark:text-gray-300">{r.label}</span>
            </div>
          ))}
        </div>
        <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1.5 list-disc pl-5 leading-relaxed">
          <li>국내 거래소 관례를 따라 <span className="text-red-500 font-medium">상승은 빨강</span>, <span className="text-blue-500 font-medium">하락은 파랑</span>입니다.</li>
          <li>마우스 커서가 손 모양으로 바뀌는 요소는 클릭할 수 있습니다.</li>
          <li>이 설명서는 별도 창이라, 메인 화면 옆에 두고 보면서 사용할 수 있습니다.</li>
          <li>각 항목의 <span className="font-mono text-brand-500">경로 ↗</span>를 누르면 <span className="font-medium">메인 창</span>이 해당 페이지로 이동합니다.</li>
          <li>현재가·호가·체결은 업비트 WebSocket으로 실시간 갱신되고, 그 외 집계는 시세 Open API에서 받아옵니다(인증 불필요). 환율·뉴스·시가총액만 외부 소스이며, 카테고리 분류는 업비트 데이터랩 '코인 분류' 기준입니다.</li>
        </ul>
      </div>

        {/* 페이지별 가이드 */}
        {GUIDE.map(item => <Section key={item.route} item={item} />)}
      </div>
    </div>
  )
}
