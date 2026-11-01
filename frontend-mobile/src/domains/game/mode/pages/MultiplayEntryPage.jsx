// 방 목록 화면 (/multiplay): 위 줄(뒤로·멀티플레이·소리) + 방 만들기/코드로 참가 + 방 카드(안에 쪽 넘김) + 바닥 입장 버튼
// app/routes/index.jsx가 씀, 목록 받기·입장은 데스크톱 usePublicRooms 그대로
import { useNavigate } from "react-router-dom"
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import { usePublicRooms } from "@/domains/game/mode/hooks/usePublicRooms.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import ModeBackdrop from "@m/domains/game/mode/components/common/ModeBackdrop.jsx"
import SoundMenu from "@m/shared/ui/sound/SoundMenu.jsx"
import TitleBadge from "@m/domains/game/mode/components/common/TitleBadge.jsx"
import TopBar from "@m/shared/ui/top/TopBar.jsx"
import EnterBar from "@m/domains/game/mode/components/roomList/EnterBar.jsx"
import Pager from "@m/domains/game/mode/components/roomList/Pager.jsx"
import RoomCardList from "@m/domains/game/mode/components/roomList/RoomCardList.jsx"
import { useRoomListPaging } from "@m/domains/game/mode/hooks/useRoomListPaging.js"

// 방 목록 화면
export default function MultiplayEntryPage() {
  const navigate = useNavigate()
  const { rooms, joinPublicRoom, isJoining } = usePublicRooms()

  // 코드 방을 골랐으면 방 id를 실어 코드 입력 화면으로
  const joinByCode = (roomId) =>
    navigate("/roomInvite", { state: typeof roomId === "string" ? { roomId } : null })

  const list = useRoomListPaging({ rooms, isJoining, onEnterRoom: joinPublicRoom, onJoinByCode: joinByCode })

  return (
    <div className="relative flex min-h-full flex-col">
      <ModeBackdrop />

      <div className="relative z-10 flex flex-1 flex-col">
        <TopBar
          onBack={() => navigate("/gameMode")}
          backLabel="게임 모드 선택으로 돌아가기"
          title={<TitleBadge />}
          right={<SoundMenu look="mode" />}
        />

        <div className="mx-auto flex w-full max-w-[48rem] flex-col gap-3 px-4 pb-4 land:px-6">
          <nav className="grid grid-cols-2 gap-3 land:flex land:gap-3 md:flex" aria-label="방 목록 작업">
            <ImageButton look="plate" src={ROOM_LIST_ASSETS.optionButton} label="방 만들기" onClick={() => navigate("/game-setup")} className="w-full land:w-40 md:w-48" />
            <ImageButton look="plate" src={ROOM_LIST_ASSETS.optionButton} label="코드로 참가" onClick={() => joinByCode()} className="w-full land:w-40 md:w-48" />
          </nav>

          <RoomCardList
            rooms={list.pageRooms}
            selectedRoomId={list.selectedRoomId}
            onSelectRoom={list.selectRoom}
            footer={<Pager currentPage={list.currentPage} pageCount={list.pageCount} onPrev={list.goPrev} onNext={list.goNext} />}
          />
        </div>
      </div>

      <EnterBar label={list.enterLabel} disabled={list.enterDisabled} onEnter={list.enterRoom} />
    </div>
  )
}
