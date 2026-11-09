// 화면 머리 부품 파일, 화면 제목(h1 하나) + 한 줄 설명 + 오른쪽 버튼 자리
// 관리자 영역 화면이 맨 위에 씀
export default function PageHeader({ title, description, actions }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  )
}
