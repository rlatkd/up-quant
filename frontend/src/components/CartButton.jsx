import { useAnalysisCart } from '../contexts/useAnalysisCart'

// 종목 행/카드에 다는 "분석 카트 담기" 토글 버튼.
// 담긴 상태면 채워진 ✓, 안 담긴 상태면 +.
// 부모 행이 클릭 이벤트를 잡고 있을 수 있어 stopPropagation 필수.
export default function CartButton({ market, size = 'sm' }) {
  const cart = useAnalysisCart()
  const inCart = cart.has(market)
  const dim = size === 'lg' ? 18 : 14

  const handleClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    cart.toggle(market)
  }

  return (
    <button
      onClick={handleClick}
      title={inCart ? '분석 카트에서 빼기' : '분석 카트에 담기 (Compare/Backtest로 함께 가져감)'}
      className={`inline-flex items-center justify-center rounded transition-colors cursor-pointer ${
        inCart
          ? 'text-brand-500 hover:text-brand-700'
          : 'text-gray-300 hover:text-brand-400'
      }`}
      style={{ width: dim + 6, height: dim + 6 }}
    >
      {inCart ? (
        // 담긴 상태: ✓ in 원
        <svg width={dim} height={dim} viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.15" />
          <path d="M6 10l3 3 5-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        // 빈 상태: + in 원
        <svg width={dim} height={dim} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <path d="M10 6v8M6 10h8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
