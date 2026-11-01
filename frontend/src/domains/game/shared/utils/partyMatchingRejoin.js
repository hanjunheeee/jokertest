// 파티 다시 모이기: 끝난 판 id를 세션 저장소에 기억하고, 먼저 온 방 준비 방송을 잠깐 들고 있음
// ingame 판 정리·matching 대기방·result 대기방 복귀가 씀
let pendingPartyMatchingRoomReady = null

const storageKey = (accountId) => `joker:partyRejoinGameId:${accountId}`

export function persistPartyRejoinGameId(accountId, gameId) {
  if (!accountId || typeof gameId !== "string" || gameId.length === 0) return
  try {
    sessionStorage.setItem(storageKey(accountId), gameId)
  } catch {
    // 저장소를 못 쓰는 환경이면 기억 없이 넘어감
  }
}

export function readPartyRejoinGameId(accountId) {
  if (!accountId) return null
  try {
    const value = sessionStorage.getItem(storageKey(accountId))
    return typeof value === "string" && value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function clearPartyRejoinGameId(accountId) {
  if (!accountId) return
  try {
    sessionStorage.removeItem(storageKey(accountId))
  } catch {
    // 저장소를 못 쓰는 환경이면 지울 것도 없음
  }
  pendingPartyMatchingRoomReady = null
}

export function rememberPartyMatchingRoomReady(payload) {
  if (payload === null || typeof payload !== "object") return
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return
  if (typeof payload.room?.roomCode !== "string" || payload.room.roomCode.length === 0) return
  pendingPartyMatchingRoomReady = payload
}

export function consumePartyMatchingRoomReady(gameId) {
  if (!pendingPartyMatchingRoomReady) return null
  if (gameId && pendingPartyMatchingRoomReady.gameId !== gameId) return null
  const value = pendingPartyMatchingRoomReady
  pendingPartyMatchingRoomReady = null
  return value
}
