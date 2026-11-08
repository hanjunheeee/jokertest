// 방 목록 줄 상태 가르기: 진행 중 / 꽉 참 / 기다림, 입장 막기 판단
// RoomListShell·RoomListRow, 모바일 useRoomListPaging·RoomCard가 씀
export function deriveRoomDisplayStatus(room) {
  if (room.status === "in_progress") return "in_progress"
  if (room.status === "full" || room.current >= room.max) return "full"
  return "waiting"
}

// 입장 못 하는 방인지: 서버 full 표시만 믿지 않고 인원(current≥max)·진행 중도 마감
// 예) { status: "waiting", current: 8, max: 8 } → true / { status: "in_progress" } → true / { current: 3, max: 8 } → false
export function isRoomClosedForEntry(room) {
  if (!room) return false
  return deriveRoomDisplayStatus(room) !== "waiting"
}
