// 소켓 객체마다 고정 번호 붙이기 (소켓이 바뀌면 다른 번호)
// 사망 공개·밤 성공·밤 차례·낮밤 시작·재판 추방 연출 훅이 범위 키에 사용

// 소켓별 번호 장부 (소켓이 버려지면 같이 사라지게 WeakMap)
const socketEpochIds = new WeakMap()
let nextSocketEpochId = 0

// 소켓 번호 (소켓이 없으면 no-socket, 처음 보는 소켓이면 새 번호)
export function getInGameSocketEpochId(socket) {
  if (socket === null || (typeof socket !== "object" && typeof socket !== "function")) return "no-socket"
  const existing = socketEpochIds.get(socket)
  if (existing !== undefined) return existing
  nextSocketEpochId += 1
  const assigned = `socket-${nextSocketEpochId}`
  socketEpochIds.set(socket, assigned)
  return assigned
}
