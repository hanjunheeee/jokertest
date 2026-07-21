// 파일 역할: MultiplayEntryPage.jsx - 라우터에서 렌더링되는 페이지입니다.
import { useNavigate } from "react-router-dom"
import GameModeTypeIndicator from "@/domains/game/mode/components/GameModeTypeIndicator.jsx"
import ModeBackground from "@/domains/game/mode/components/ModeBackground.jsx"
import ModePageControls from "@/domains/game/mode/components/ModePageControls.jsx"
import MultiplayRoomListArea from "@/domains/game/mode/components/MultiplayRoomListArea.jsx"
import { usePublicRooms } from "@/domains/game/mode/hooks/usePublicRooms.js"

// 멀티플레이 공개방 목록 진입 페이지입니다.
// 공개방 목록이 기본 화면이라 빠른 매칭(연회장 찾기) 진입은 이 화면에서 제거했습니다.
export default function MultiplayEntryPage() {
  const navigate = useNavigate()
  const { rooms, joinPublicRoom, isJoining } = usePublicRooms()

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <ModeBackground />
      <div className="absolute inset-0 z-10">
        <GameModeTypeIndicator size="compact" />
        <MultiplayRoomListArea
          rooms={rooms}
          onCreateGame={() => navigate("/game-setup")}
          onJoinByCode={() => navigate("/roomInvite")}
          onEnterRoom={joinPublicRoom}
          isJoining={isJoining}
        />
        <ModePageControls
          backAriaLabel="게임 모드 선택으로 돌아가기"
          onBack={() => navigate("/gameMode")}
        />
      </div>
    </div>
  )
}
