/**
 * 밤 역할 턴 안내의 상태 기계(순수 함수).
 *
 * reduceInGamePhaseEntrance와 같은 모양이지만 다루는 대상이 다르다(그쪽은 DAY/NIGHT 진입
 * 연출, 이쪽은 역할 턴 안내). 결정적으로 이 기계에는 "다음 턴"이라는 개념 자체가 없다 —
 * 입력으로 들어온 역할 하나만 보고, 그것을 띄울지 말지만 정한다.
 *
 * 입력 role은 canonical 역할 턴이 아니라 **연출 릴의 커서가 가리키는 역할**이다
 * (useInGameNightTurnAnnouncement가 릴을 전진시키고 그 결과만 여기로 넘긴다). 이 기계의 로직은
 * 그 구분과 무관하다 — 여기서는 "관측된 역할이 무엇이든 identity 하나당 정확히 한 번"만 지킨다.
 *
 * 상태:
 *   scope   : 현재 유효한 scope(계정+게임+소켓 세대). null이면 안내 대상 세션이 없다.
 *   seen    : 이 scope에서 이미 한 번 관측한 identity 목록. 같은 identity가 다시 관측돼도
 *             (같은 방송 재수신·중복 store 적용·roster/비밀정보 갱신·리렌더·StrictMode
 *             이중 실행·스냅샷 재적용) 절대 다시 열지 않는다.
 *   pending : 열 자격은 얻었지만 아직 못 띄운 안내. 앞 순서 오버레이(역할 공개·사망 연출·
 *             DAY/NIGHT 진입 연출)가 떠 있는 동안 여기서 기다리며, 기다리는 동안 "소비됨"이
 *             되지 않는다 — 그래서 "밤이 되었습니다"를 닫으면 반드시 그 뒤에 뜬다.
 *   active  : 지금 실제로 화면에 떠 있는 안내.
 *
 * 규칙:
 *   1. scope가 바뀌면(계정·게임·소켓 세대 변경) 대기·표시 상태를 전부 버린다.
 *   2. 새 scope에서 처음 관측한 identity와 스냅샷 하이드레이션으로 도착한 identity는
 *      baseline으로만 등록한다 — 이미 진행 중인 밤에 복원된 것이지 방금 턴이 바뀐 것이
 *      아니므로 안내하지 않는다. 이후의 실시간 canonical 변경은 정상적으로 안내한다.
 *   3. 그 외에 이 scope에서 처음 보는 identity만 실제 연출 진행이다 — 정확히 한 번 대기열에
 *      넣는다. 여기가 안내가 열리는 유일한 경로다.
 *   4. 관측 identity가 대기·표시 중인 것과 달라지면(릴이 다음 칸으로 넘어감, 날짜가 바뀜,
 *      NIGHT를 벗어남, ENDED) 그 안내는 즉시 무효가 된다.
 *   5. 앞 순서 오버레이가 없으면 pending을 띄우고, 띄운 뒤에 앞 순서가 열리면 다시 pending으로
 *      내린다(소비하지 않는다).
 *
 * dismiss는 지금 떠 있는 안내를 닫기만 한다 — 무엇도 대기열에 넣지 않고, 어떤 인덱스도 올리지
 * 않으며, 다음 역할을 추론하지도 않는다. 닫힌 identity는 seen에 남아 있으므로 같은 턴이 다시
 * 관측돼도 다시 열리지 않는다.
 *
 * 반환값은 바뀐 것이 없으면 입력 state 참조를 그대로 돌려준다(리렌더 유발 없음).
 */

export const INITIAL_IN_GAME_NIGHT_TURN_ANNOUNCEMENT = Object.freeze({
  scope: null,
  seen: Object.freeze([]),
  pending: null,
  active: null,
})

/**
 * 관측 입력 하나를 반영한 다음 상태를 만든다.
 *
 * @param {object} state 현재 상태(INITIAL_IN_GAME_NIGHT_TURN_ANNOUNCEMENT 형태)
 * @param {object} input
 * @param {string|null} input.scope     현재 scope(null이면 안내 대상 세션 없음)
 * @param {string|null} input.identity  현재 identity(null이면 안내할 역할 턴이 없음)
 * @param {string|null} input.role      릴 커서가 가리키는 연출 역할
 * @param {number|null} input.dayIndex  현재 canonical dayIndex
 * @param {boolean} input.hold          더 앞 순서의 오버레이가 떠 있는가
 * @param {boolean} input.hydrated      이번 관측이 스냅샷 하이드레이션으로 생긴 것인가
 */
export function reduceInGameNightTurnAnnouncement(state, input) {
  const { scope = null, identity = null, role = null, dayIndex = null, hold = false, hydrated = false } = input ?? {}

  const scopeChanged = scope !== state.scope
  let seen = scopeChanged ? [] : state.seen
  let pending = scopeChanged ? null : state.pending
  let active = scopeChanged ? null : state.active

  // 관측 identity에서 벗어난 대기·표시 상태는 더 이상 유효하지 않다(규칙 4).
  if (pending !== null && pending.identity !== identity) pending = null
  if (active !== null && active.identity !== identity) active = null

  if (identity !== null && !seen.includes(identity)) {
    seen = [...seen, identity]
    // 새 scope의 첫 관측과 스냅샷 하이드레이션은 baseline일 뿐 실시간 턴 변경이 아니다(규칙 2).
    if (!hydrated && !scopeChanged) {
      pending = { identity, role, dayIndex }
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
 * 닫기(사용자 확인 또는 자동 닫힘 타이머)를 반영한다.
 *
 * 지금 떠 있는 안내의 identity와 정확히 일치할 때만 닫는다 — 이전 턴·이전 밤·이전 게임·이전
 * 계정·이전 소켓 세대의 늦은 콜백은 새로 뜬 안내를 대신 닫아버리지 않는다. 닫기는 오직
 * active를 비울 뿐이고, 다음 역할 턴을 열거나 추론하는 일은 어떤 경우에도 하지 않는다.
 */
export function dismissInGameNightTurnAnnouncement(state, targetIdentity) {
  if (state.active === null) return state
  if (typeof targetIdentity !== "string" || targetIdentity !== state.active.identity) return state
  return { ...state, active: null }
}
