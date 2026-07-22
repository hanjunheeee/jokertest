// game-core/gameSession.js의 GAME_ROLES와 값이 일치해야 한다 — 이 프로젝트에는 백엔드/프런트가
// 공유하는 상수 모듈이 없어 수동으로 동기화한다(둘 중 하나가 바뀌면 같이 바꿔야 함).
const ALLOWED_ROLES = ["JOKER", "CITIZEN"]
const EMPTY_RESULT = Object.freeze({ sourcePlayers: null, localPlayerId: null })

/**
 * 서버 game_started state를 InGamePlayerSessionProvider가 기대하는 sourcePlayers/localPlayerId
 * 형태로 변환합니다. 이 함수의 책임은 플레이어 세션 변환이므로, state.players 각 항목의
 * uuid/nickname과 state.self의 uuid/role만 엄격히 검증합니다(state.id/phase/dayIndex,
 * self.nickname 등 이 함수가 쓰지 않는 필드는 검증 대상이 아닙니다) — 검증 대상 필드
 * 중 하나라도 어긋나면 부분 목록 대신 안전한 preview fallback을 돌려줍니다.
 */
export function buildPlayerSessionSourceFromGameState(state) {
  if (!state || !Array.isArray(state.players)) return EMPTY_RESULT

  const seenUuids = new Set()
  for (const player of state.players) {
    if (!player || typeof player !== "object") return EMPTY_RESULT
    if (typeof player.uuid !== "string" || player.uuid.length === 0) return EMPTY_RESULT
    if (typeof player.nickname !== "string" || player.nickname.trim().length === 0) return EMPTY_RESULT
    if (seenUuids.has(player.uuid)) return EMPTY_RESULT
    seenUuids.add(player.uuid)
  }

  const self = state.self
  if (!self || typeof self !== "object") return EMPTY_RESULT
  if (typeof self.uuid !== "string" || !seenUuids.has(self.uuid)) return EMPTY_RESULT
  if (!ALLOWED_ROLES.includes(self.role)) return EMPTY_RESULT

  const sourcePlayers = state.players.map((player) => {
    const entry = { id: player.uuid, name: player.nickname, connected: true, alive: true }
    // 본인 항목에만 role을 연결한다. 다른 참가자 항목에는 role 키 자체를 만들지 않는다
    // (UNKNOWN 같은 가짜 값도 채우지 않음) — 비밀 유지. team은 기존 코드에 명확한
    // 매핑 근거가 없어 설정하지 않는다.
    if (player.uuid === self.uuid) entry.role = self.role
    return entry
  })

  return { sourcePlayers, localPlayerId: self.uuid }
}
