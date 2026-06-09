// 페이지 전체 에러 — 데이터 로드 실패 시 빈 화면 대신 안내 + "다시 시도" 버튼을 보여준다.
// onRetry를 주면 해당 훅의 retry()를 연결(재요청), 없으면 새로고침으로 폴백.
export default function PageError({
  message = '데이터를 불러오지 못했습니다.',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  const handle = onRetry ?? (() => window.location.reload())
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="text-3xl">⚠️</div>
      <div className="text-sm text-gray-500 dark:text-gray-400">{message}</div>
      <button
        onClick={handle}
        className="px-4 py-2 text-sm font-semibold rounded-md bg-brand-500 hover:bg-brand-600 text-white cursor-pointer"
      >
        다시 시도
      </button>
      <div className="text-xs text-gray-400 dark:text-gray-500">
        문제가 계속되면 백엔드 서버(:8000)가 실행 중인지 확인하세요.
      </div>
    </div>
  )
}
