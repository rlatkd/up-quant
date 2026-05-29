// 모든 페이지 상단의 제목줄. 페이지가 곧장 콘텐츠로 시작하던 것을 통일된 헤더로 정돈.
export default function PageHeader({ title, description, action }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold text-gray-800 tracking-tight">{title}</h1>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}
