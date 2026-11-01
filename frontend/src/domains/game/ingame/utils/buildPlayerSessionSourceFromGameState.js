// 판 상태 → 플레이어 세션 재료(참가자 목록·내 id), 모양이 틀리면 빈 결과
// 플레이어 세션 Provider(InGamePlayerSessionProvider)가 사용
import { INGAME_PLAYER_THEME_PALETTE_SIZE } from "../../../../shared/constants/ingamePlayerTheme.js"

// 직업 → 팀 짝 (본인 팀 검사용)
const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}
// 하나라도 틀리면 돌려주는 빈 결과
const EMPTY_RESULT = Object.freeze({ sourcePlayers: null, localPlayerId: null })

// 참가자·본인 검사를 통과하면 화면용 참가자 목록과 내 id
export function buildPlayerSessionSourceFromGameState(state) {
  // 참가자 검사: uuid·별명·생존·색 번호 모양, 같은 uuid 두 번이면 거절
  if (!state || !Array.isArray(state.players)) return EMPTY_RESULT

  const seenUuids = new Set()
  for (const player of state.players) {
    if (!player || typeof player !== "object") return EMPTY_RESULT
    if (typeof player.uuid !== "string" || player.uuid.length === 0) return EMPTY_RESULT
    if (typeof player.nickname !== "string" || player.nickname.trim().length === 0) return EMPTY_RESULT
    if (typeof player.alive !== "boolean") return EMPTY_RESULT
    if (!Number.isInteger(player.themeIndex)) return EMPTY_RESULT
    if (player.themeIndex < 0 || player.themeIndex >= INGAME_PLAYER_THEME_PALETTE_SIZE) return EMPTY_RESULT
    if (seenUuids.has(player.uuid)) return EMPTY_RESULT
    seenUuids.add(player.uuid)
  }

  // 본인 검사: 명단 안 사람이고 직업·팀 짝이 맞아야 함
  const self = state.self
  if (!self || typeof self !== "object") return EMPTY_RESULT
  if (typeof self.uuid !== "string" || !seenUuids.has(self.uuid)) return EMPTY_RESULT
  if (!Object.hasOwn(ROLE_TEAMS, self.role)) return EMPTY_RESULT
  if (self.team !== ROLE_TEAMS[self.role]) return EMPTY_RESULT

  // 조커면 동료 목록 검사 (본인·명단 밖·중복이면 거절), 조커가 아닌데 오면 거절
  if (self.role === "JOKER") {
    if (!Object.hasOwn(self, "allies")) return EMPTY_RESULT
    if (!Array.isArray(self.allies)) return EMPTY_RESULT
    const seenAllies = new Set()
    for (const allyUuid of self.allies) {
      if (typeof allyUuid !== "string" || allyUuid.length === 0) return EMPTY_RESULT
      if (allyUuid === self.uuid) return EMPTY_RESULT
      if (!seenUuids.has(allyUuid)) return EMPTY_RESULT
      if (seenAllies.has(allyUuid)) return EMPTY_RESULT
      seenAllies.add(allyUuid)
    }
  } else if (Object.hasOwn(self, "allies")) {
    return EMPTY_RESULT
  }

  const allyIds = self.role === "JOKER" ? new Set(self.allies) : null

  // 화면용 참가자: 본인엔 직업·팀, 동료엔 동료 표시, 계정 꾸밈은 온 것만
  const sourcePlayers = state.players.map((player) => {
    const entry = {
      id: player.uuid,
      name: player.nickname,
      // 연결 여부를 모르면 연결된 것으로 봄
      connected: typeof player.isConnected === "boolean" ? player.isConnected : true,
      alive: player.alive,
      themeIndex: player.themeIndex,
    }
    if (player.uuid === self.uuid) {
      entry.role = self.role
      entry.team = self.team
    } else if (allyIds?.has(player.uuid)) {
      entry.isAlly = true
    }
    if (Object.hasOwn(player, "accountProfilePhotoId")) {
      entry.accountProfilePhotoId = player.accountProfilePhotoId
    }
    if (Object.hasOwn(player, "accountProfileBorderId")) {
      entry.accountProfileBorderId = player.accountProfileBorderId
    }
    if (Object.hasOwn(player, "accountCardFrameId")) {
      entry.accountCardFrameId = player.accountCardFrameId
    }
    if (Object.hasOwn(player, "accountTotalGames")) {
      entry.accountTotalGames = player.accountTotalGames
    }
    if (Object.hasOwn(player, "accountWinRate")) {
      entry.accountWinRate = player.accountWinRate
    }
    return entry
  })

  return { sourcePlayers, localPlayerId: self.uuid }
}
