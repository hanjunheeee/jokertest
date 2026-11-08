// 화면 시험(e2e)용 data 속성 이름과 플레이어 카드 값 만들기
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

// 플레이어 카드 속성 (이름·상태·본인 여부)
export function buildPlayerCardE2eAttrs({ nickname, status, isSelf } = {}) {
  const attrs = {}
  if (isNonEmptyString(nickname)) attrs[INGAME_E2E_ATTRS.playerNickname] = nickname
  if (isNonEmptyString(status)) attrs[INGAME_E2E_ATTRS.playerStatus] = status
  if (typeof isSelf === "boolean") attrs[INGAME_E2E_ATTRS.playerSelf] = isSelf ? "true" : "false"
  return attrs
}
