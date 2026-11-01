import { INGAME_PLAYER_STATUS } from "../../shared/constants/ingamePlayerStatus.js"

export function isSessionPlayerAlive(sessionPlayer) {
  return sessionPlayer?.status !== INGAME_PLAYER_STATUS.DEAD
}

export function buildDayVoteTargets(sessionPlayers, { localPlayerId, excludedUuids = [] } = {}) {
  if (!Array.isArray(sessionPlayers)) return []
  const excluded = new Set(excludedUuids)

  return sessionPlayers
    .filter((player) => isSessionPlayerAlive(player) && player.id !== localPlayerId && !excluded.has(player.id))
    .map((player) => ({
      id: player.id,
      name: player.nickname,
      alive: true,
      connected: player.status !== INGAME_PLAYER_STATUS.DISCONNECTED,
    }))
}
