// 파일 역할: RoomListShell.jsx - 화면을 구성하는 컴포넌트입니다.
import { useEffect, useMemo, useState } from "react"
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
// 상태라 이 컴포넌트가 소유합니다. isJoining은 상위(usePublicRooms)가 소유·전달합니다
// (성공/실패/timeout 판정에 필요한 소켓 이벤트 리스너가 그 훅에 있기 때문입니다).
export default function RoomListShell({ rooms, onCreateGame, onJoinByCode, onEnterRoom, isJoining = false }) {
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [currentPage, setCurrentPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(rooms.length / PAGE_SIZE))

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount - 1))
  }, [pageCount])

  // 현재 페이지 분량만 잘라내고, 표시 상태(waiting/full/in_progress)를 미리 계산해 내려줍니다.
  const pageRooms = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return rooms
      .slice(start, start + PAGE_SIZE)
      .map((room) => ({ ...room, displayStatus: deriveRoomDisplayStatus(room) }))
  }, [rooms, currentPage])

  const selectedRoom = pageRooms.find((room) => room.id === selectedRoomId) ?? null
  const selectedRoomNeedsCode = selectedRoom?.accessType === "code"
  const selectedRoomIsFull = selectedRoom?.status === "full"

  // 선택한 방이 실시간 방송으로 목록에서 완전히 사라지면(삭제되거나 필터링됨) 선택을
  // 초기화합니다. 페이지 이동으로 인해 "지금 화면에 안 보일 뿐"인 경우는 이 effect가 아니라
  // goToPrevPage/goToNextPage가 명시적으로 선택을 비웁니다 — 두 소멸 원인을 분리해 각각
  // 명확한 정책으로 처리합니다(목록 자체에서 사라짐 vs 페이지 밖으로 나감).
  useEffect(() => {
    if (selectedRoomId === null) return
    const stillExists = rooms.some((room) => room.id === selectedRoomId)
    if (!stillExists) setSelectedRoomId(null)
  }, [rooms, selectedRoomId])

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

  const handleEnterRoom = () => {
    if (selectedRoom && !selectedRoomNeedsCode && !selectedRoomIsFull && !isJoining) {
      onEnterRoom?.(selectedRoom.id)
    }
  }

  // 서버가 최종 권한/정원 검증을 다시 하므로(pendingRoomTransitions 등), 이 조건은 서버
  // 보호를 대체하지 않는 프런트 UX 보조일 뿐입니다 — 불필요한 요청과 헷갈리는 버튼 상태를
  // 미리 걸러낼 뿐, 서버가 최종 실패를 응답할 가능성은 항상 남아 있습니다.
  const enterDisabled = !selectedRoom || selectedRoomNeedsCode || selectedRoomIsFull || isJoining

  const enterLabel = isJoining
    ? "입장 중"
    : selectedRoomNeedsCode
      ? "코드 필요"
      : selectedRoomIsFull
        ? "마감"
        : "입장하기"

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
          aria-label={enterLabel === "입장하기" ? "선택한 방 입장" : enterLabel}
          disabled={enterDisabled}
          onClick={handleEnterRoom}
          className={ROOM_LIST_ENTER_BTN_CLASS}
        >
          <PublicAsset src={ROOM_LIST_ASSETS.enterButton} alt="" className={ROOM_LIST_ENTER_BTN_FRAME_CLASS} />
          <span className={ROOM_LIST_ENTER_BTN_LABEL_CLASS}>{enterLabel}</span>
        </button>
      </div>
    </div>
  )
}
