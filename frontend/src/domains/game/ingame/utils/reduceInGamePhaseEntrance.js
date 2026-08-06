/**
 * DAY/NIGHT 진입 연출의 상태 기계(순수 함수).
 *
 * React 밖에서 전부 결정되도록 순수 함수로 떼어 놓았다 — 렌더 순서·타이밍 경쟁이 아니라
 * 아래의 명시적 규칙만으로 "지금 무엇을 보여줄지"가 결정된다.
 *
 * 상태:
 *   scope   : 현재 유효한 scope 문자열(계정+게임+소켓 세대). null이면 연출 대상 세션이 없다.
 *   seen    : 이 scope에서 이미 한 번 관측한 identity 목록. 같은 identity가 다시 관측돼도
 *             (같은 방송 재수신·중복 store 적용·roster 갱신·리렌더·StrictMode 이중 실행)
 *             절대 다시 대기열에 넣지 않는다.
 *   pending : 표시 자격은 얻었지만 아직 띄우지 못한 연출. 더 높은 우선순위 오버레이(자기
 *             역할 공개, 사망 연출)가 떠 있는 동안 여기서 기다린다 — 기다리는 동안에도
 *             "소비됨"으로 처리하지 않는다. 그래서 상위 오버레이가 닫히면 반드시 뜬다.
 *   active  : 지금 실제로 화면에 떠 있는 연출.
 *
 * 규칙:
 *   1. scope가 바뀌면(계정·게임·소켓 세대 변경) 대기·표시 상태를 전부 버린다.
 *   2. 새 scope에서 처음 관측한 identity와, 스냅샷 하이드레이션으로 도착한 identity는
 *      "baseline"으로만 등록한다 — 이미 진행 중인 낮/밤에 재접속한 것이지 방금 전이한 것이
 *      아니므로 연출하지 않는다.
 *   3. 그 외에 이 scope에서 처음 보는 identity는 실시간 canonical 전이다 — 정확히 한 번
 *      대기열에 넣는다.
 *   4. 관측 identity가 대기·표시 중인 것과 달라지면(phase/dayIndex가 옮겨감, DAY/NIGHT를
 *      벗어남 = ENDED·TRIBUNAL·ROLE_REVEAL) 그 연출은 즉시 무효가 된다.
 *   5. 상위 오버레이가 없으면 pending을 띄우고, 표시 중에 상위 오버레이가 열리면 다시
 *      pending으로 내린다(소비하지 않는다).
 *
 * 반환값은 바뀐 것이 없으면 입력 state 참조를 그대로 돌려준다(리렌더 유발 없음).
 */

export const INITIAL_IN_GAME_PHASE_ENTRANCE = Object.freeze({
  scope: null,
  seen: Object.freeze([]),
  pending: null,
  active: null,
})

/**
 * 관측 입력 하나를 반영한 다음 상태를 만든다.
 *
 * @param {object} state   현재 상태(INITIAL_IN_GAME_PHASE_ENTRANCE 형태)
 * @param {object} input
 * @param {string|null} input.scope     현재 scope(null이면 연출 대상 세션 없음)
 * @param {string|null} input.identity  현재 identity(null이면 DAY/NIGHT 구간이 아님)
 * @param {string|null} input.phase     현재 canonical phase
 * @param {number|null} input.dayIndex  현재 canonical dayIndex
 * @param {boolean} input.hold          더 높은 우선순위 오버레이가 떠 있는가
 * @param {boolean} input.hydrated      이번 관측이 스냅샷 하이드레이션으로 생긴 것인가
 */
export function reduceInGamePhaseEntrance(state, input) {
  const { scope = null, identity = null, phase = null, dayIndex = null, hold = false, hydrated = false } = input ?? {}

  const scopeChanged = scope !== state.scope
  let seen = scopeChanged ? [] : state.seen
  let pending = scopeChanged ? null : state.pending
  let active = scopeChanged ? null : state.active

  // 관측 identity에서 벗어난 대기·표시 상태는 더 이상 유효하지 않다(규칙 4).
  if (pending !== null && pending.identity !== identity) pending = null
  if (active !== null && active.identity !== identity) active = null

  if (identity !== null && !seen.includes(identity)) {
    seen = [...seen, identity]
    // 새 scope의 첫 관측과 스냅샷 하이드레이션은 baseline일 뿐 실시간 전이가 아니다(규칙 2).
    if (!hydrated && !scopeChanged) {
      pending = { identity, phase, dayIndex }
    }
  }

  if (pending !== null && active === null && !hold) {
    active = pending
    pending = null
  } else if (active !== null && hold) {
    pending = active
    active = null
  }

  if (!scopeChanged && seen === state.seen && pending === state.pending && active === state.active) {
    return state
  }
  return { scope, seen, pending, active }
}

/**
 * 확인(닫기)을 반영한다. 지금 떠 있는 연출의 identity와 정확히 일치할 때만 닫는다 —
 * 이전 identity(이전 낮/밤, 이전 게임, 이전 소켓 세대)의 늦은 확인·타이머 콜백은 새로 뜬
 * 연출을 대신 닫아버리지 않는다.
 */
export function confirmInGamePhaseEntrance(state, targetIdentity) {
  if (state.active === null) return state
  if (typeof targetIdentity !== "string" || targetIdentity !== state.active.identity) return state
  return { ...state, active: null }
}
