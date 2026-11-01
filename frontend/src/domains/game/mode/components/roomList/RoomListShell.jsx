import { useEffect, useMemo, useState } from "react"
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

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount - 1))
  }, [pageCount])

  const pageRooms = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return rooms
      .slice(start, start + PAGE_SIZE)
      .map((room) => ({ ...room, displayStatus: deriveRoomDisplayStatus(room) }))
  }, [rooms, currentPage])

  const selectedRoom = pageRooms.find((room) => room.id === selectedRoomId) ?? null
  const selectedRoomNeedsCode = selectedRoom?.accessType === "code"
  const selectedRoomIsFull = selectedRoom?.status === "full"

  useEffect(() => {
    if (selectedRoomId === null) return
    const stillExists = rooms.some((room) => room.id === selectedRoomId)
    if (!stillExists) setSelectedRoomId(null)
  }, [rooms, selectedRoomId])

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

  const enterLabel = isJoining
    ? "입장 중"
    : selectedRoomNeedsCode
      ? "코드 입력"
      : selectedRoomIsFull
        ? "마감"
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
