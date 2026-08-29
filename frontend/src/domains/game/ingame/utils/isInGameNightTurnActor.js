/**
 * 지금 진행 중인 밤 역할 턴이 내 직업의 턴인가.
 *
 * 밤 행동 패널의 활성/비활성을 가르는 유일한 판정이다. 활성 조건과 비활성 조건을 서로 다른
 * 곳에서 계산하면 한쪽만 고쳐졌을 때 "내 턴이 아닌데 제출 버튼이 열려 있는" 상태로 회귀하므로,
 * 두 방향 모두 이 함수 하나의 결과만 쓴다.
 *
 * 턴이 없으면(NIGHT가 아니거나 canonical하게 건너뛰는 턴이라 selectInGameNightTurnRole이 null)
 * 어느 직업의 턴도 아니므로 fail-closed로 false다 — 서버 submitNightAction도 진행 중인 턴이
 * 아닌 제출을 거부하므로, 이 게이트는 그 거부를 UI에서 미리 반영하는 것이다.
 *
 * @param {*} nightTurnRole - selectInGameNightTurnRole이 고른 현재 턴 역할
 * @param {*} myRole - state.self.role
 */
export function isInGameNightTurnActor(nightTurnRole, myRole) {
  if (typeof nightTurnRole !== "string" || nightTurnRole.length === 0) return false
  if (typeof myRole !== "string" || myRole.length === 0) return false
  return nightTurnRole === myRole
}
