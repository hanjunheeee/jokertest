// 화면 시험(e2e)용 data 속성 이름과 값 만들기 (조작 패널·플레이어 카드·대상)
// 플레이어 카드와 시험이 씀
import { isNonEmptyString } from "../../shared/utils/valueChecks.js"

// e2e가 찾는 data 속성 이름
export const INGAME_E2E_ATTRS = Object.freeze({
  phase: "data-ingame-phase",
  dayIndex: "data-ingame-day-index",
  selfRole: "data-ingame-self-role",
  playerNickname: "data-ingame-player-nickname",
  playerStatus: "data-ingame-player-status",
  playerSelf: "data-ingame-player-self",
  targetId: "data-ingame-target-id",
})

// 조작 패널 속성 (단계·날짜·내 역할, 이상한 값은 뺌)
export function buildControlPanelE2eAttrs(gameState) {
  if (gameState === null || typeof gameState !== "object" || Array.isArray(gameState)) return {}

  const attrs = {}
  if (isNonEmptyString(gameState.phase)) attrs[INGAME_E2E_ATTRS.phase] = gameState.phase
  if (Number.isInteger(gameState.dayIndex)) attrs[INGAME_E2E_ATTRS.dayIndex] = String(gameState.dayIndex)
  if (isNonEmptyString(gameState.self?.role)) attrs[INGAME_E2E_ATTRS.selfRole] = gameState.self.role
  return attrs
}

// 플레이어 카드 속성 (이름·상태·본인 여부)
export function buildPlayerCardE2eAttrs({ nickname, status, isSelf } = {}) {
  const attrs = {}
  if (isNonEmptyString(nickname)) attrs[INGAME_E2E_ATTRS.playerNickname] = nickname
  if (isNonEmptyString(status)) attrs[INGAME_E2E_ATTRS.playerStatus] = status
  if (typeof isSelf === "boolean") attrs[INGAME_E2E_ATTRS.playerSelf] = isSelf ? "true" : "false"
  return attrs
}

// 대상 버튼 속성 (id 없으면 빈 값)
export function buildTargetE2eAttrs(player) {
  if (player === null || typeof player !== "object" || Array.isArray(player)) return {}
  if (!isNonEmptyString(player.id)) return {}
  return { [INGAME_E2E_ATTRS.targetId]: player.id }
}
