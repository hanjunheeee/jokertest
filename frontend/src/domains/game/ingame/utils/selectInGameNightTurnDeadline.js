/**
 * 밤 역할 턴의 시계를 다루는 두 순수 함수.
 *
 * selectInGameNightTurnDeadline은 "지금 턴의 마감 시각이 언제인가"를 store state 하나에서만
 * 읽고, computeInGameNightTurnRemainingSec은 그 시각과 현재 시각의 차이를 "남은 초"로 바꾼다.
 * 시각을 고르는 일과 남은 시간을 세는 일을 나눠 둬야 후자를 타이머 없이 그대로 검증할 수 있다.
 *
 * deadline은 서버 night_turn_started payload가 실어 보낸 절대시각(epoch ms)이다 — 백엔드
 * advanceNightTurn이 nowFn() + 그 직업의 제한시간으로 계산한다. 그래서 이 값 자체는 리렌더·
 * 재구독과 무관하게 고정이고, 남은 시간만 현재 시각에 따라 움직인다. 서버와 클라이언트 시계가
 * 어긋나면 그만큼 표시가 밀리지만, 계약이 절대시각 하나뿐이라 클라이언트가 보정할 근거가 없다.
 */
import { selectInGameNightTurnRole } from "./selectInGameNightTurnRole.js"

/**
 * 지금 진행 중인 턴의 마감 시각(없으면 null).
 *
 * 역할 판정(selectInGameNightTurnRole)에 종속시킨다 — 보여줄 턴이 없으면 남은 시간도 없다.
 * 두 판정을 따로 두면 NIGHT를 벗어난 뒤에도 카운트다운만 남거나, 역할 표기와 남은 시간이 서로
 * 다른 턴을 가리키는 화면이 나온다.
 */
export function selectInGameNightTurnDeadline(state) {
  if (selectInGameNightTurnRole(state) === null) return null

  const deadline = state.nightTurnDeadline
  // 0 이하·비유한 값은 계산이 어긋났다는 뜻이므로 남은 시간을 아예 표시하지 않는다
  // (parseNightTurnStartedPayload와 같은 기준) — 그대로 두면 처음부터 0초인 턴이 화면에 남는다.
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  return deadline
}

/** 남은 초 — 이미 지난 마감은 음수로 흐르지 않고 0에서 멈춘다. deadline이 없으면 null이다. */
export function computeInGameNightTurnRemainingSec(deadline, now) {
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  if (!Number.isFinite(now)) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
