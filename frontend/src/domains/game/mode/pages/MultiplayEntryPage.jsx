import { useNavigate } from "react-router-dom"
import GameModeTypeIndicator from "../components/GameModeTypeIndicator.jsx"
import ModeBackground from "../components/ModeBackground.jsx"
import ModePageControls from "../components/ModePageControls.jsx"
import MultiplayRoomListArea from "../components/MultiplayRoomListArea.jsx"
import { usePublicRooms } from "../hooks/usePublicRooms.js"

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
          onJoinByCode={(roomId) =>
            navigate("/roomInvite", { state: typeof roomId === "string" ? { roomId } : null })
          }
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
