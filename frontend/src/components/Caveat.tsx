// 정량 결과의 신뢰성 한계를 정직하게 노출하는 공용 주석. 퀀트 대상 서비스에선 한계 명시 = 신뢰 신호.
// 과거 amber 경고박스가 거슬린다는 피드백을 반영해, 거슬리지 않는 작은 회색 한 줄 주석으로 통일한다.
const PRESETS: Record<string, string> = {
  backtest: '※ 인샘플 결과로 미래 보장이 아닙니다. 현재 상장 종목만 대상이라 생존편향이 있고, 거래비용·슬리피지 추정·단일 종목 올인/올아웃 가정의 한계가 있습니다. 샤프·소르티노·칼마는 무위험수익률 0 가정(연율화 √365).',
  momentum: '※ 현재 상장 종목만 대상이라 생존편향이 있으며, 인샘플·거래비용 반영분만 차감했습니다. 롱숏은 공매도(현물 미지원) 가정이며 과거 성과가 미래를 보장하지 않습니다.',
  pairs: '※ 공적분은 여러 페어를 동시 검정(다중검정)이라 우연한 발견이 섞일 수 있습니다(FDR 표기 참고). 검증수익은 거래기간(OOS) 2-leg 시뮬이며 보장이 아닙니다.',
  portfolio: '※ 기대수익·공분산은 과거 추정치(미래 불확실)이고, 무위험수익률 0 가정·거래비용/세금 미반영입니다. 비중은 참고용이며 투자 권유가 아닙니다.',
  risk: '※ VaR/CVaR는 과거 분포·정규근사 기반 추정으로 실제 꼬리 위험을 과소평가할 수 있습니다. 무위험수익률 0 가정.',
}

export default function Caveat({ kind = 'backtest', text }: { kind?: keyof typeof PRESETS | string; text?: string }) {
  const body = text || PRESETS[kind] || PRESETS.backtest
  // 위 요소와 너무 붙지 않게 공통 위 간격 — 모든 Caveat에 일괄 적용(mt-5 + 옅은 상단 구분선).
  return (
    <div className="mt-5 pt-3 border-t border-gray-100 dark:border-[#232d40] text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">{body}</div>
  )
}
