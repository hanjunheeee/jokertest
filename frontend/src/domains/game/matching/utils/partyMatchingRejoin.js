let pendingPartyMatchingRoomReady = null

const storageKey = (accountId) => `joker:partyRejoinGameId:${accountId}`

export function persistPartyRejoinGameId(accountId, gameId) {
  if (!accountId || typeof gameId !== "string" || gameId.length === 0) return
  try {
    sessionStorage.setItem(storageKey(accountId), gameId)
  } catch {
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
