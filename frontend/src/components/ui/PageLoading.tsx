// 페이지 전체 로딩 — 페이지가 쓰는 데이터가 모두 준비될 때까지 본문 자리에 통짜로 표시한다.
// (요소별 부분 스피너가 아니라 페이지 단위. 프리페치 덕에 실사용에선 대부분 캐시 히트로 빠르게 지나간다.)
export default function PageLoading({ message = '데이터를 불러오는 중입니다…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="w-10 h-10 border-[3px] border-gray-200 dark:border-[#2c3850] border-t-brand-500 rounded-full animate-spin" />
      <div className="text-sm text-gray-400 dark:text-gray-500">{message}</div>
    </div>
  )
}
