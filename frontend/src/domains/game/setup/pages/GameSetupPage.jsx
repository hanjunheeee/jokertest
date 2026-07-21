// 파일 역할: GameSetupPage.jsx - 라우터에서 렌더링되는 페이지입니다.
/**
 * 인게임 설정(게임 만들기) 화면.
 *
 * 배경·설정 패널·공통 버튼만 조합합니다.
 */
import GameSetupBackground from "../components/GameSetupBackground.jsx"
import GameSetupPanel from "../components/GameSetupPanel.jsx"
import GameSetupPageControls from "../components/GameSetupPageControls.jsx"
import { useGameSetupPage } from "../hooks/useGameSetupPage.js"

export default function GameSetupPage() {
  const { uiVisible, isCreating, goBackToMultiplay, createGame } = useGameSetupPage()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <GameSetupBackground />
      <GameSetupPanel
        visible={uiVisible}
        isCreating={isCreating}
        onCreateGame={createGame}
      />
      <GameSetupPageControls visible={uiVisible} onBack={goBackToMultiplay} />
    </div>
  )
}
