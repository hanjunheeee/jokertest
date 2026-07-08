/**
 * 멀티플레이(일반 방 찾기) — 방목록 화면
 *
 * - 뒤로가기 → /gameMode
 * - 게임 만들기(상단) → /game-setup
 * - 게임 찾기(상단) → 랜덤 매칭 큐 진입 → match_found 수신 → /game-matching
 *
 * UI: GameModeTypeIndicator + RoomListShell + MatchingSearchOverlay
 */
import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import MatchingSearchOverlay from "@/domains/game/matching/components/MatchingSearchOverlay.jsx"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore"
import { MODE_SCREEN_ASSETS } from "../constants/modeAssets.js"
import GameModeTypeIndicator from "../components/GameModeTypeIndicator.jsx"
import RoomListShell from "../components/roomList/RoomListShell.jsx"
import BackButton from "@/shared/ui/BackButton.jsx"
import { BACK_BUTTON_PAGE_POSITION_CLASS } from "@/shared/constants/navigationLayout.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { getSocket } from "@/shared/socket/socketClient"
import { publicAsset } from "@/shared/utils/publicAsset"

const DUMMY_ROOMS = [
  { id: "room-1", stage: 1, current: 2, max: 5, title: "누구든 들어와 방" },
  { id: "room-2", stage: 1, current: 4, max: 8, title: "초보 환영" },
  { id: "room-3", stage: 2, current: 7, max: 10, title: "진지하게 ㄱㄱ" },
  { id: "room-4", stage: 1, current: 1, max: 6, title: "친구 구함" },
  { id: "room-5", stage: 3, current: 5, max: 10, title: "연습방" },
  { id: "room-6", stage: 2, current: 3, max: 8, title: "느긋하게" },
  { id: "room-7", stage: 1, current: 6, max: 10, title: "공개방 테스트" },
  { id: "room-8", stage: 2, current: 2, max: 8, title: "밤늦게만" },
  { id: "room-9", stage: 1, current: 5, max: 6, title: "거의 만석" },
  { id: "room-10", stage: 3, current: 8, max: 10, title: "고수만" },
  { id: "room-11", stage: 1, current: 3, max: 10, title: "편하게 놀자" },
  { id: "room-12", stage: 2, current: 4, max: 8, title: "속임수 연습" },
  { id: "room-13", stage: 1, current: 1, max: 5, title: "새벽반" },
  { id: "room-14", stage: 2, current: 6, max: 10, title: "토론-heavy" },
  { id: "room-15", stage: 3, current: 3, max: 8, title: "승부는 진지하게" },
  { id: "room-16", stage: 1, current: 7, max: 10, title: "인원 많음" },
  { id: "room-17", stage: 2, current: 2, max: 6, title: "소규모 정예" },
  { id: "room-18", stage: 1, current: 4, max: 8, title: "초보 OK" },
  { id: "room-19", stage: 3, current: 9, max: 10, title: "마감 임박" },
  { id: "room-20", stage: 2, current: 5, max: 10, title: "스크롤 테스트" },
]

export default function MultiplayEntryPage() {
  const navigate = useNavigate()
  const isSearching = useMatchingStore((s) => s.isSearching)
  const isInRoom = useMatchingStore((s) => s.isInRoom)
  const startSearch = useMatchingStore((s) => s.startSearch)
  const stopSearch = useMatchingStore((s) => s.stopSearch)

  useEffect(() => {
    if (isInRoom) navigate("/game-matching")
  }, [isInRoom, navigate])

  const handleQuickJoin = () => {
    const socket = getSocket()
    if (!socket) return
    startSearch()
    socket.emit("join_matchmaking")
  }

  const handleCancelSearch = () => {
    getSocket()?.emit("leave_matchmaking")
    stopSearch()
  }

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <img
        src={publicAsset(MODE_SCREEN_ASSETS.bg)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <div className="absolute inset-0 z-10">
        <GameModeTypeIndicator />

        <RoomListShell
          rooms={DUMMY_ROOMS}
          onCreateGame={() => navigate("/game-setup")}
          onQuickJoin={handleQuickJoin}
          onRoomSelect={() => {}}
        />

        <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6">
          <SoundControl />
        </div>

        <MatchingSearchOverlay open={isSearching} onCancel={handleCancelSearch} />

        <BackButton
          ariaLabel="게임 모드 선택으로 돌아가기"
          onClick={() => navigate("/gameMode")}
          className={BACK_BUTTON_PAGE_POSITION_CLASS}
        />
      </div>
    </div>
  )
}
