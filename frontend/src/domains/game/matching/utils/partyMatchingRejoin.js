/** @type {{gameId:string, room:object}|null} */
let pendingPartyMatchingRoomReady = null

const storageKey = (accountId) => `joker:partyRejoinGameId:${accountId}`

/** 결과 → 매칭 대기 중인 ENDED gameId를 sessionStorage에 남긴다(새로고침 복구). */
export function persistPartyRejoinGameId(accountId, gameId) {
  if (!accountId || typeof gameId !== "string" || gameId.length === 0) return
  try {
    sessionStorage.setItem(storageKey(accountId), gameId)
  } catch {
    // sessionStorage 불가 환경은 조용히 건너뛴다.
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
    // noop
  }
  pendingPartyMatchingRoomReady = null
}

/** 결과 화면 등 매칭 훅 밖에서 도착한 party_matching_room_ready를 잠깐 보관한다. */
export function rememberPartyMatchingRoomReady(payload) {
  if (payload === null || typeof payload !== "object") return
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return
  if (typeof payload.room?.roomCode !== "string" || payload.room.roomCode.length === 0) return
  pendingPartyMatchingRoomReady = payload
}

/** endedGameId와 맞는 보관값이 있으면 꺼내고 비운다. */
export function consumePartyMatchingRoomReady(gameId) {
  if (!pendingPartyMatchingRoomReady) return null
  if (gameId && pendingPartyMatchingRoomReady.gameId !== gameId) return null
  const value = pendingPartyMatchingRoomReady
  pendingPartyMatchingRoomReady = null
  return value
}
