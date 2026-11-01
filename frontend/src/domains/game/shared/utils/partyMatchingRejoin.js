// 파티 다시 모이기: 끝난 판 id를 세션 저장소에 기억하고, 먼저 온 방 준비 방송을 잠깐 들고 있음
// ingame 판 정리·matching 대기방·result 대기방 복귀가 씀
// 화면 오기 전에 받은 파티 방 준비 방송 (한 번 꺼내 쓰면 비움)
let pendingRoomReady = null

// 계정별 저장 키
const storageKey = (accountId) => `joker:partyRejoinGameId:${accountId}`

// 끝난 판 id 기억 (새로고침해도 남게 세션 저장소에)
export function persistRejoinGameId(accountId, gameId) {
  if (!accountId || typeof gameId !== "string" || gameId.length === 0) return
  try {
    sessionStorage.setItem(storageKey(accountId), gameId)
  } catch {
    // 저장소를 못 쓰는 환경이면 기억 없이 넘어감
  }
}

// 기억한 끝난 판 id 읽기 (없거나 못 읽으면 null)
export function readRejoinGameId(accountId) {
  if (!accountId) return null
  try {
    const value = sessionStorage.getItem(storageKey(accountId))
    return typeof value === "string" && value.length > 0 ? value : null
  } catch {
    return null
  }
}

// 기억 지우기, 들고 있던 방송도 버림
export function clearRejoinGameId(accountId) {
  if (!accountId) return
  try {
    sessionStorage.removeItem(storageKey(accountId))
  } catch {
    // 저장소를 못 쓰는 환경이면 지울 것도 없음
  }
  pendingRoomReady = null
}

// 파티 방 준비 방송 들고 있기 (판 id·방 코드 있는 것만)
export function rememberRoomReady(payload) {
  if (payload === null || typeof payload !== "object") return
  if (typeof payload.gameId !== "string" || payload.gameId.length === 0) return
  if (typeof payload.room?.roomCode !== "string" || payload.room.roomCode.length === 0) return
  pendingRoomReady = payload
}

// 들고 있던 방송 꺼내기 (다른 판 것이면 안 꺼냄)
export function consumeRoomReady(gameId) {
  if (!pendingRoomReady) return null
  if (gameId && pendingRoomReady.gameId !== gameId) return null
  const value = pendingRoomReady
  pendingRoomReady = null
  return value
}
