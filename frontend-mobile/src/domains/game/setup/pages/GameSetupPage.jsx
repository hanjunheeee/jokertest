// 방 설정 화면 (/game-setup): 위 줄·탭·설정 목록 한 열, 게임 만들기는 바닥 고정
// app/routes/index.jsx가 씀, 저장값 복원·방 만들기·뒤로 가기는 데스크톱 useGameSetupPage 그대로
import { useGameSetupPage } from "@/domains/game/setup/hooks/useGameSetupPage.js"
import SetupBackground from "../components/SetupBackground.jsx"
import SetupTopBar from "../components/top/SetupTopBar.jsx"
import SetupPanel from "../components/SetupPanel.jsx"

// 방 설정 화면
export default function GameSetupPage() {
  const {
    uiVisible, isCreating, goBackToMultiplay, createGame,
    initialFormState, formResetKey, restoreNotice,
  } = useGameSetupPage()

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <SetupBackground />
      <div className="relative mx-auto flex h-full w-full max-w-2xl flex-col gap-2 px-3 pb-2 land:max-w-none land:px-4 land:pb-1">
        <SetupTopBar onBack={goBackToMultiplay} />
        {restoreNotice ? (
          <p
            role="alert"
            className="shrink-0 text-center font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold leading-snug text-[#ffb3a7] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
          >
            {restoreNotice}
          </p>
        ) : null}
        <SetupPanel
          visible={uiVisible}
          isCreating={isCreating}
          onCreateGame={createGame}
          initialFormState={initialFormState}
          formResetKey={formResetKey}
        />
      </div>
    </div>
  )
}
