// 방 설정 위 줄: 뒤로 가기·제목·소리 조절
// pages/GameSetupPage가 씀 (데스크톱은 왼쪽 아래·오른쪽 아래 구석에 있던 조작)
import BackButton from "@m/shared/ui/button/BackButton.jsx"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

// 위 줄 (제목은 좁으면 말줄임), 뒤로 효과음은 useGameSetupPage가 직접 내서 sfxOwner
export default function SetupTopBar({ onBack }) {
  return (
    <header className="flex h-13 shrink-0 items-center gap-2 land:h-11">
      <BackButton
        onClick={onBack}
        label="멀티플레이 선택으로 돌아가기"
        sfxOwner
        className="group flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0"
        iconClassName="block w-11 select-none transition-transform group-active:scale-90"
      />
      <h1 className="min-w-0 flex-1 truncate font-subheading app-text-scaled [--app-text-size:1.25rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
        게임 설정
      </h1>
      <SoundControl look="setup" />
    </header>
  )
}
