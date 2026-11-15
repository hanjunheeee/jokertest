// 멀티 화면 (방 목록·방 만들기·코드 입장), 들어올 때 남은 판·대기방 자리 정리
// 경로 /multiplay가 씀
import { useNavigate } from "react-router-dom"
import GameModeTypeIndicator from "../components/GameModeTypeIndicator.jsx"
import ModeBackground from "../components/ModeBackground.jsx"
import ModePageControls from "../components/ModePageControls.jsx"
import MultiplayRoomListArea from "../components/MultiplayRoomListArea.jsx"
import { usePublicRooms } from "../hooks/usePublicRooms.js"
import { useLobbyEntryCleanup } from "@/domains/game/shared/hooks/useLobbyEntryCleanup.js"

export default function MultiplayEntryPage() {
  const navigate = useNavigate()
  // 들어올 때 서버가 남은 판·대기방 자리를 지움 (판 중 산 사람이면 판 화면으로)
  useLobbyEntryCleanup()
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
