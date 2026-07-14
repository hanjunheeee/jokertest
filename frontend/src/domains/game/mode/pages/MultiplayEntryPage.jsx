// 파일 역할: MultiplayEntryPage.jsx - 라우터에서 렌더링되는 페이지입니다.
import { useNavigate } from "react-router-dom"
import MatchingSearchOverlay from "@/domains/game/matching/components/MatchingSearchOverlay.jsx"
import GameModeTypeIndicator from "@/domains/game/mode/components/GameModeTypeIndicator.jsx"
import ModeBackground from "@/domains/game/mode/components/ModeBackground.jsx"
import ModePageControls from "@/domains/game/mode/components/ModePageControls.jsx"
import MultiplayRoomListArea from "@/domains/game/mode/components/MultiplayRoomListArea.jsx"
import { useMatchmakingSearch } from "@/domains/game/mode/hooks/useMatchmakingSearch.js"

// 멀티플레이 공개방 목록 진입 페이지입니다.
export default function MultiplayEntryPage() {
  const navigate = useNavigate()
  const { isSearching, startQuickMatch, cancelQuickMatch } = useMatchmakingSearch()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <ModeBackground />
      <div className="absolute inset-0 z-10">
        <GameModeTypeIndicator />
        <MultiplayRoomListArea
          onCreateGame={() => navigate("/game-setup")}
          onQuickJoin={startQuickMatch}
          onRoomSelect={() => {}}
        />
        <MatchingSearchOverlay open={isSearching} onCancel={cancelQuickMatch} />
        <ModePageControls
          backAriaLabel="게임 모드 선택으로 돌아가기"
          onBack={() => navigate("/gameMode")}
        />
      </div>
    </div>
  )
}
