import { INGAME_PLAYER_THEME_PALETTE_SIZE } from "../constants/ingamePlayerTheme.js"

const ROLE_TEAMS = {
  JOKER: "JOKER",
  CITIZEN: "CITIZEN",
  DOCTOR: "CITIZEN",
  GUARD: "CITIZEN",
  WITCH_HUNTER: "CITIZEN",
}
const EMPTY_RESULT = Object.freeze({ sourcePlayers: null, localPlayerId: null })

export function buildPlayerSessionSourceFromGameState(state) {
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

  const self = state.self
  if (!self || typeof self !== "object") return EMPTY_RESULT
  if (typeof self.uuid !== "string" || !seenUuids.has(self.uuid)) return EMPTY_RESULT
  if (!Object.hasOwn(ROLE_TEAMS, self.role)) return EMPTY_RESULT
  if (self.team !== ROLE_TEAMS[self.role]) return EMPTY_RESULT

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

  const sourcePlayers = state.players.map((player) => {
    const entry = {
      id: player.uuid,
      name: player.nickname,
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
