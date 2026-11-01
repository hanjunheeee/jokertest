// 화면 위 고정 줄: 왼쪽 뒤로 가기, 가운데 제목, 오른쪽 자리(소리 조절 등)
// 모드 영역 페이지·마이페이지 틀(ScreenFrame)이 씀, 데스크톱 왼쪽 아래 뒤로 가기를 위로 옮긴 것
import BackButton from "@m/shared/ui/button/BackButton.jsx"

// 데스크톱처럼 덮개 없는 투명 줄 (어두운 그라데이션 안 깖)
const BAR_CLASS =
  "sticky top-0 z-30 flex h-14 items-center gap-2 px-3 land:h-12"

// 오른쪽이 비어도 제목이 가운데 오게 같은 폭 자리 둠, 줄 높이 등은 className으로 바꿈
export default function TopBar({
  onBack,
  backLabel = "뒤로 가기",
  backIconClassName = "block h-auto w-full select-none",
  title = null,
  right = null,
  className = BAR_CLASS,
}) {
  return (
    <header className={className}>
      <BackButton onClick={onBack} label={backLabel} iconClassName={backIconClassName} />

      <div className="flex min-w-0 flex-1 justify-center">{title}</div>

      <div className="flex min-w-11 shrink-0 justify-end">{right}</div>
    </header>
  )
}
