import { isNonEmptyString } from "../../../shared/utils/valueChecks.js"

export const INGAME_E2E_ATTRS = Object.freeze({
  phase: "data-ingame-phase",
  dayIndex: "data-ingame-day-index",
  selfRole: "data-ingame-self-role",
  playerNickname: "data-ingame-player-nickname",
  playerStatus: "data-ingame-player-status",
  playerSelf: "data-ingame-player-self",
  targetId: "data-ingame-target-id",
})

export function buildInGameControlPanelE2eAttrs(gameState) {
  if (gameState === null || typeof gameState !== "object" || Array.isArray(gameState)) return {}

  const attrs = {}
  if (isNonEmptyString(gameState.phase)) attrs[INGAME_E2E_ATTRS.phase] = gameState.phase
  if (Number.isInteger(gameState.dayIndex)) attrs[INGAME_E2E_ATTRS.dayIndex] = String(gameState.dayIndex)
  if (isNonEmptyString(gameState.self?.role)) attrs[INGAME_E2E_ATTRS.selfRole] = gameState.self.role
  return attrs
}

export function buildInGamePlayerCardE2eAttrs({ nickname, status, isSelf } = {}) {
  const attrs = {}
  if (isNonEmptyString(nickname)) attrs[INGAME_E2E_ATTRS.playerNickname] = nickname
  if (isNonEmptyString(status)) attrs[INGAME_E2E_ATTRS.playerStatus] = status
  if (typeof isSelf === "boolean") attrs[INGAME_E2E_ATTRS.playerSelf] = isSelf ? "true" : "false"
  return attrs
}

export function buildInGameTargetE2eAttrs(player) {
  if (player === null || typeof player !== "object" || Array.isArray(player)) return {}
  if (!isNonEmptyString(player.id)) return {}
  return { [INGAME_E2E_ATTRS.targetId]: player.id }
}
