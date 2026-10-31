const socketEpochIds = new WeakMap()
let nextSocketEpochId = 0

export function getInGameSocketEpochId(socket) {
  if (socket === null || (typeof socket !== "object" && typeof socket !== "function")) return "no-socket"
  const existing = socketEpochIds.get(socket)
  if (existing !== undefined) return existing
  nextSocketEpochId += 1
  const assigned = `socket-${nextSocketEpochId}`
  socketEpochIds.set(socket, assigned)
  return assigned
}
