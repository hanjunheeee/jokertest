// 게임 준비 화면 (방 설정 고르고 만들기), 들어올 때 남은 판·대기방 자리 정리
// 경로 /game-setup이 씀
import GameSetupBackground from "../components/GameSetupBackground.jsx"
import GameSetupPanel from "../components/GameSetupPanel.jsx"
import GameSetupPageControls from "../components/GameSetupPageControls.jsx"
import { useGameSetupPage } from "../hooks/useGameSetupPage.js"
import { useLobbyEntryCleanup } from "@/domains/game/shared/hooks/useLobbyEntryCleanup.js"

export default function GameSetupPage() {
  // 들어올 때 서버가 남은 판·대기방 자리를 지움 (판 중 산 사람이면 판 화면으로)
  useLobbyEntryCleanup()
  const {
    uiVisible, isCreating, goBackToMultiplay, createGame,
    initialFormState, formResetKey,
  } = useGameSetupPage()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <GameSetupBackground />
      <GameSetupPanel
        visible={uiVisible}
        isCreating={isCreating}
        onCreateGame={createGame}
        initialFormState={initialFormState}
        formResetKey={formResetKey}
      />
      <GameSetupPageControls visible={uiVisible} onBack={goBackToMultiplay} />
    </div>
  )
}
