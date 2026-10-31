export function deriveRoomDisplayStatus(room) {
  if (room.status === "in_progress") return "in_progress"
  if (room.current >= room.max) return "full"
  return "waiting"
}
