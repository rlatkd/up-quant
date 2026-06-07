// 전 페이지 공용 로딩 스피너. (기존엔 w-6/w-7/w-8로 제각각 복붙돼 있던 것을 통일)
export default function Spinner({ full = false, size = 'md' }) {
  const dim = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-8 h-8' : 'w-7 h-7'
  const circle = <div className={`${dim} border-2 border-gray-200 dark:border-[#2c3850] border-t-brand-500 rounded-full animate-spin`} />
  if (full) return <div className="py-24 flex justify-center">{circle}</div>
  return <div className="flex justify-center py-16">{circle}</div>
}
