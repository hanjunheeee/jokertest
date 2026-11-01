// 파티 다시 모이기: 끝난 판 id를 세션 저장소에 기억하고, 먼저 온 방 준비 방송을 잠깐 들고 있음
// ingame 판 정리·matching 대기방·result 대기방 복귀가 씀
let pendingRoomReady = null

const storageKey = (accountId) => `joker:partyRejoinGameId:${accountId}`

export function persistRejoinGameId(accountId, gameId) {
  if (!accountId || typeof gameId !== "string" || gameId.length === 0) return
  try {
    sessionStorage.setItem(storageKey(accountId), gameId)
  } catch {
    // 저장소를 못 쓰는 환경이면 기억 없이 넘어감
  }
}

export function readRejoinGameId(accountId) {
  if (!accountId) return null
  try {
    const value = sessionStorage.getItem(storageKey(accountId))
    return typeof value === "string" && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function clearRejoinGameId(accountId) {
  if (!accountId) return
  try {
    sessionStorage.removeItem(storageKey(accountId))
  } catch {
    // 저장소를 못 쓰는 환경이면 지울 것도 없음
  }
  pendingRoomReady = null
}

export function rememberRoomReady(payload) {
  if (payload === null || typeof payload !== "object") return
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return
  if (typeof payload.room?.roomCode !== "string" || payload.room.roomCode.length === 0) return
  pendingRoomReady = payload
}

export function consumeRoomReady(gameId) {
  if (!pendingRoomReady) return null
  if (gameId && pendingRoomReady.gameId !== gameId) return null
  const value = pendingRoomReady
  pendingRoomReady = null
  return value
}
