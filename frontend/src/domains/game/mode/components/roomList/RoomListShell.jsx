// 파일 역할: RoomListShell.jsx - 화면을 구성하는 컴포넌트입니다.
import { useMemo, useState } from "react"
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import {
  ROOM_LIST_ENTER_BTN_CLASS,
  ROOM_LIST_ENTER_BTN_FRAME_CLASS,
  ROOM_LIST_ENTER_BTN_LABEL_CLASS,
  ROOM_LIST_FOOTER_CLASS,
  ROOM_LIST_SHELL_CLASS,
  ROOM_LIST_TOOLBAR_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import { deriveRoomDisplayStatus } from "@/domains/game/mode/utils/deriveRoomDisplayStatus.js"
import RoomListActionButton from "@/domains/game/mode/components/roomList/RoomListActionButton.jsx"
import RoomListPanel from "@/domains/game/mode/components/roomList/RoomListPanel.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 기준 한 페이지에 보여줄 방 개수(2열x6행). 화면 크기에 따라 동적으로 바꾸지 않습니다.
const PAGE_SIZE = 12

// 공개 방 목록 화면의 작업 버튼, 방 목록(+페이지네이션), 입장 버튼을 조합합니다.
// 선택된 방(selectedRoomId)과 현재 페이지(currentPage)는 목록 패널과 페이지네이션이 함께 쓰는
// 상태라 이 컴포넌트가 소유합니다.
export default function RoomListShell({ rooms, onCreateGame, onJoinByCode }) {
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(rooms.length / PAGE_SIZE))

  // 현재 페이지 분량만 잘라내고, 표시 상태(waiting/full/in_progress)를 미리 계산해 내려줍니다.
  const pageRooms = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return rooms
      .slice(start, start + PAGE_SIZE)
      .map((room) => ({ ...room, displayStatus: deriveRoomDisplayStatus(room) }))
  }, [rooms, currentPage])

  const selectedRoom = pageRooms.find((room) => room.id === selectedRoomId) ?? null

  // 같은 방을 다시 누르면 선택을 해제합니다. 마감/진행중 방은 RoomListRow에서 이미 클릭을 막습니다.
  const handleSelectRoom = (roomId) => {
    setSelectedRoomId((current) => (current === roomId ? null : roomId))
  }

  const goToPrevPage = () => {
    setSelectedRoomId(null)
    setCurrentPage((page) => Math.max(0, page - 1))
  }

  const goToNextPage = () => {
    setSelectedRoomId(null)
    setCurrentPage((page) => Math.min(pageCount - 1, page + 1))
  }

  // 이번 레이아웃 작업 범위 밖: 실제 Socket 입장 요청/코드 입력 모달은 후속 작업에서 연결합니다.
  // open 방은 즉시 입장, code 방은 코드 입력 UI를 여는 동작으로 나뉠 예정입니다.
  const handleEnterRoom = () => {}

  return (
    <div className={ROOM_LIST_SHELL_CLASS}>
      <nav className={ROOM_LIST_TOOLBAR_CLASS} aria-label="방 목록 작업">
        <RoomListActionButton label="방 만들기" onClick={onCreateGame} />
        <RoomListActionButton label="코드로 참가" onClick={onJoinByCode} />
      </nav>

      <RoomListPanel
        rooms={pageRooms}
        selectedRoomId={selectedRoomId}
        onSelectRoom={handleSelectRoom}
        currentPage={currentPage}
        pageCount={pageCount}
        onPrevPage={goToPrevPage}
        onNextPage={goToNextPage}
      />

      <div className={ROOM_LIST_FOOTER_CLASS}>
        <button
          type="button"
          aria-label="선택한 방 입장"
          disabled={!selectedRoom}
          onClick={handleEnterRoom}
          className={ROOM_LIST_ENTER_BTN_CLASS}
        >
          <PublicAsset src={ROOM_LIST_ASSETS.enterButton} alt="" className={ROOM_LIST_ENTER_BTN_FRAME_CLASS} />
          <span className={ROOM_LIST_ENTER_BTN_LABEL_CLASS}>입장하기</span>
        </button>
      </div>
    </div>
  )
}
