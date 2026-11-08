// 방 목록 셸: 위 작업 줄·목록 판·쪽 넘김·입장 버튼, 고른 방·쪽 번호 상태
// MultiplayRoomListArea가 씀
import { useMemo, useState } from "react"
import { ROOM_LIST_ASSETS } from "../../constants/roomListAssets.js"
import {
  ENTER_BTN_CLASS,
  ENTER_BTN_FRAME_CLASS,
  ENTER_BTN_LABEL_CLASS,
  ROOM_LIST_FOOTER_CLASS,
  ROOM_LIST_SHELL_CLASS,
  ROOM_LIST_TOOLBAR_CLASS,
} from "../../constants/roomListLayout.js"
import { deriveRoomDisplayStatus } from "../../utils/deriveRoomDisplayStatus.js"
import RoomListActionButton from "./RoomListActionButton.jsx"
import RoomListPanel from "./RoomListPanel.jsx"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"

const PAGE_SIZE = 12

export default function RoomListShell({ rooms, onCreateGame, onJoinByCode, onEnterRoom, isJoining = false }) {
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(rooms.length / PAGE_SIZE))

  // 목록이 줄어 쪽이 사라지면 마지막 쪽으로 (그리는 중에 바로 맞춤)
  if (currentPage > pageCount - 1) setCurrentPage(pageCount - 1)

  const pageRooms = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return rooms
      .slice(start, start + PAGE_SIZE)
      .map((room) => ({ ...room, displayStatus: deriveRoomDisplayStatus(room) }))
  }, [rooms, currentPage])

  const selectedRoom = pageRooms.find((room) => room.id === selectedRoomId) ?? null
  const selectedRoomNeedsCode = selectedRoom?.accessType === "code"
  const selectedRoomIsFull = selectedRoom?.status === "full"

  // 고른 방이 목록에서 사라지면 고름 풂 (다시 생겨도 저절로 안 골라지게)
  if (selectedRoomId !== null && !rooms.some((room) => room.id === selectedRoomId)) {
    setSelectedRoomId(null)
  }

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

  const handleEnterRoom = () => {
    if (!selectedRoom || selectedRoomIsFull || isJoining) return
    if (selectedRoomNeedsCode) onJoinByCode?.(selectedRoom.id)
    else onEnterRoom?.(selectedRoom.id)
  }

  const enterDisabled = !selectedRoom || selectedRoomIsFull || isJoining

  // 꽉 찬 방은 코드 방이어도 "마감" (잠긴 버튼에 "코드 입력"이 뜨지 않게)
  const enterLabel = isJoining
    ? "입장 중"
    : selectedRoomIsFull
      ? "마감"
      : selectedRoomNeedsCode
        ? "코드 입력"
        : "입장하기"

  return (
    <div className={ROOM_LIST_SHELL_CLASS}>
      <nav className={ROOM_LIST_TOOLBAR_CLASS} aria-label="방 목록 작업">
        <RoomListActionButton label="방 만들기" onClick={onCreateGame} />
        <RoomListActionButton label="코드로 참가" onClick={() => onJoinByCode?.()} />
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
          aria-label={enterLabel === "입장하기" ? "선택한 방 입장" : enterLabel}
          disabled={enterDisabled}
          onClick={handleEnterRoom}
          className={ENTER_BTN_CLASS}
        >
          <PublicAsset src={ROOM_LIST_ASSETS.enterButton} alt="" className={ENTER_BTN_FRAME_CLASS} />
          <span className={ENTER_BTN_LABEL_CLASS}>{enterLabel}</span>
        </button>
      </div>
    </div>
  )
}
