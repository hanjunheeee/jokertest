// 방 설정 화면 (/game-setup): 위 줄·탭·설정 목록 한 열·게임 만들기 버튼, 들어올 때 남은 판·대기방 자리 정리
// app/routes/index.jsx가 씀, 방 만들기·뒤로 가기는 데스크톱 useGameSetupPage 그대로
import { useGameSetupPage } from "@/domains/game/setup/hooks/useGameSetupPage.js"
import { useLobbyEntryCleanup } from "@/domains/game/shared/hooks/useLobbyEntryCleanup.js"
import SetupBackground from "../components/SetupBackground.jsx"
import SetupTopBar from "../components/top/SetupTopBar.jsx"
import SetupPanel from "../components/SetupPanel.jsx"

// 방 설정 화면 (만들기 버튼도 배경 위에 둬서 데스크톱처럼 배경이 비침)
export default function GameSetupPage() {
  // 들어올 때 서버가 남은 판·대기방 자리를 지움 (판 중 산 사람이면 판 화면으로)
  useLobbyEntryCleanup()
  const {
    uiVisible, isCreating, goBackToMultiplay, createGame,
    initialFormState, formResetKey,
  } = useGameSetupPage()

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <SetupBackground />
      <div className="relative mx-auto flex h-full w-full max-w-2xl flex-col gap-2 px-3 pb-3 land:max-w-none land:px-4 land:pb-2">
        <SetupTopBar visible={uiVisible} onBack={goBackToMultiplay} />
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
