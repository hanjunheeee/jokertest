// 방의 화면 표시 상태를 계산합니다.
// status가 "in_progress"면 정원과 무관하게 그대로 유지하고, 그 외에는 current >= max일 때만
// "full"로 파생시킵니다. "full"은 더미 데이터에 저장하지 않고 항상 이 함수로 계산합니다.
export function deriveRoomDisplayStatus(room) {
  if (room.status === "in_progress") return "in_progress"
  if (room.current >= room.max) return "full"
  return "waiting"
}
