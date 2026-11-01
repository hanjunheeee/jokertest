// 이모티콘 화면 위 줄 (뒤로 가기 그림 버튼 + 제목)
// EmoticonPalettePage가 씀
import BackButton from "@m/shared/ui/button/BackButton.jsx"

// 데스크톱 왼쪽 아래 뒤로 버튼을 엄지 닿는 위 줄로 옮김
export default function TopBar({ title, onBack }) {
  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 px-3 land:h-12">
      <BackButton
        onClick={onBack}
        className="flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 active:scale-95"
        iconClassName="block h-11 w-11 select-none object-contain"
      />
      <h1 className="min-w-0 truncate font-display text-xl text-[#e8c878] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        {title}
      </h1>
    </header>
  )
}
