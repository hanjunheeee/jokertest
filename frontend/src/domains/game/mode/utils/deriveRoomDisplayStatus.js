// 방 목록 줄 상태 가르기: 진행 중 / 꽉 참 / 기다림
// RoomListShell이 씀
export function deriveRoomDisplayStatus(room) {
  if (room.status === "in_progress") return "in_progress"
  if (room.current >= room.max) return "full"
  return "waiting"
}
