// 방 목록 쪽 나누기·방 고르기·입장 버튼 상태
// MultiplayEntryPage가 씀, 데스크톱 RoomListShell(화면 파일이라 못 부름) 안 판단을 그대로 옮김
import { useMemo, useState } from "react"
import { deriveRoomDisplayStatus } from "@/domains/game/mode/utils/deriveRoomDisplayStatus.js"

// 한 쪽 방 수 (데스크톱과 같음)
export const PAGE_SIZE = 12

// 쪽·고른 방·입장 버튼 상태와 처리 함수
export function useRoomListPaging({ rooms, isJoining, onEnterRoom, onJoinByCode }) {
  const [selectedRoomId, setSelectedRoomId] = useState(null)
  const [pageIndex, setPageIndex] = useState(0)

  const pageCount = Math.max(1, Math.ceil(rooms.length / PAGE_SIZE))
  // 방이 줄어 쪽 수가 줄면 마지막 쪽으로 당김
  const currentPage = Math.min(pageIndex, pageCount - 1)

  // 지금 쪽 방들 + 표시 상태(진행중·마감·대기)
  const pageRooms = useMemo(() => {
    const start = currentPage * PAGE_SIZE
    return rooms
      .slice(start, start + PAGE_SIZE)
      .map((room) => ({ ...room, displayStatus: deriveRoomDisplayStatus(room) }))
  }, [rooms, currentPage])

  // 고른 방이 목록에서 사라지면 안 고른 걸로 봄
  const selectedRoom = pageRooms.find((room) => room.id === selectedRoomId) ?? null
  const needsCode = selectedRoom?.accessType === "code"
  const isFull = selectedRoom?.status === "full"

  // 같은 방 다시 누르면 풀림
  const selectRoom = (roomId) => {
    setSelectedRoomId((current) => (current === roomId ? null : roomId))
  }

  // 쪽 넘기면 고른 방 풀림
  const goPrev = () => {
    setSelectedRoomId(null)
    setPageIndex(Math.max(0, currentPage - 1))
  }
  const goNext = () => {
    setSelectedRoomId(null)
    setPageIndex(Math.min(pageCount - 1, currentPage + 1))
  }

  // 코드 방은 코드 입력 화면으로, 공개 방은 바로 들어가기
  const enterRoom = () => {
    if (!selectedRoom || isFull || isJoining) return
    if (needsCode) onJoinByCode?.(selectedRoom.id)
    else onEnterRoom?.(selectedRoom.id)
  }

  const enterDisabled = !selectedRoom || isFull || isJoining
  const enterLabel = isJoining ? "입장 중" : needsCode ? "코드 입력" : isFull ? "마감" : "입장하기"

  return {
    pageRooms,
    currentPage,
    pageCount,
    selectedRoomId: selectedRoom?.id ?? null,
    selectRoom,
    goPrev,
    goNext,
    enterRoom,
    enterDisabled,
    enterLabel,
  }
}
