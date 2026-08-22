import { getInGameRoleRevealDisplay } from "../constants/roleReveal/ingameRoleRevealData.js"

/** INVESTIGATE(경비대 조사)가 알려주는 값은 진영 둘뿐이다 — role 값이 team 자리에 오면 거부한다. */
const INVESTIGATE_TEAMS = Object.freeze(["JOKER", "CITIZEN"])

/**
 * night_action_result 개인 결과를 화면에 그대로 쓸 수 있는 형태로 정규화한다(순수 함수).
 *
 * payload는 소켓으로 들어온 신뢰하지 않는 외부 입력이고 players는 canonical roster다. 표시
 * 문구는 역할 공개 표시 데이터(getInGameRoleRevealDisplay)를 재사용해 만들어 "광대 진영"·
 * "마녀사냥꾼" 같은 표기가 역할 공개 화면과 어긋나지 않게 한다.
 *
 * 대상 uuid를 roster에서 찾지 못하면 uuid를 대신 노출하지 않고 표시 자체를 포기한다(null) —
 * 조사 결과는 대상이 누구인지 확정되지 않으면 아무 의미가 없기 때문이다.
 *
 * @param {object|null} payload night_action_result payload
 *   ({ actionType: "INVESTIGATE", targetId, team } 또는 { actionType: "CONFIRM", targetId, role })
 * @param {Array|null} players canonical roster([{ uuid, nickname, ... }])
 * @flow payload/players 형태 검증 → roster에서 대상 조회 → actionType별 라벨 조립. 어느 단계든
 *   맞지 않으면 즉시 null을 돌려준다(호출부가 오버레이를 열지 않는다).
 * @returns {{kind: "INVESTIGATE"|"CONFIRM", targetNickname: string, label: string}|null}
 */
export function reduceInGameNightPrivateResult(payload, players) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (!Array.isArray(players)) return null
  if (payload.actionType !== "INVESTIGATE" && payload.actionType !== "CONFIRM") return null
  if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return null

  const target = players.find((p) => p && p.uuid === payload.targetId) ?? null
  if (target === null) return null
  if (typeof target.nickname !== "string" || target.nickname.length === 0) return null

  if (payload.actionType === "INVESTIGATE") {
    if (!INVESTIGATE_TEAMS.includes(payload.team)) return null
    const display = getInGameRoleRevealDisplay(payload.team)
    if (display === null) return null
    return {
      kind: "INVESTIGATE",
      targetNickname: target.nickname,
      label: `${target.nickname} 님은 ${display.teamLabel}입니다`,
    }
  }

  const display = getInGameRoleRevealDisplay(payload.role)
  if (display === null) return null
  return {
    kind: "CONFIRM",
    targetNickname: target.nickname,
    label: `${target.nickname} 님의 역할은 ${display.name}입니다`,
  }
}
