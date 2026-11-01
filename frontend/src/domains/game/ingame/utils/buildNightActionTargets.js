import { INGAME_PLAYER_STATUS } from "../../shared/constants/ingamePlayerStatus.js"

export function buildNightActionTargets(players, { localPlayerId, selfTargetAllowed, role } = {}) {
  if (!Array.isArray(players)) return []

  return players
    .filter((player) => selfTargetAllowed || player.id !== localPlayerId)
    .map((player) => ({
      id: player.id,
      name: player.isAlly ? `${player.nickname} · 동료 JOKER` : player.nickname,
      alive: player.status !== INGAME_PLAYER_STATUS.DEAD,
      connected: player.status !== INGAME_PLAYER_STATUS.DISCONNECTED,
      selectable: !player.isAlly && (role === "WITCH_HUNTER"
        ? player.status === INGAME_PLAYER_STATUS.DEAD
        : player.status !== INGAME_PLAYER_STATUS.DEAD),
    }))
}
