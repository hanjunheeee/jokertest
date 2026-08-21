/**
 * 밤 사망 공개 연출(kill reveal) 큐의 상태 기계(순수 함수).
 *
 * DAY/NIGHT 진입 연출(reduceInGamePhaseEntrance)과 같은 원칙을 쓰되, 한 번에 하나의
 * identity만 다루는 그것과 달리 이 연출은 한 밤에 여러 희생자가 나올 수 있어 FIFO 큐로
 * 관리한다(요구사항: multiple deathReveals sequence). React 밖에서 전부 결정되도록 순수
 * 함수로 떼어 놓았다.
 *
 * 상태:
 *   scope   : 현재 유효한 scope 문자열(계정+게임+소켓 세대). null이면 연출 대상 세션이 없다.
 *   seenIds : 이 scope에서 이미 큐에 넣어본 적 있는 항목 id 목록. 같은 id가 다시 들어와도
 *             (같은 방송 재수신·중복 store 적용·리렌더·StrictMode 이중 실행) 절대 다시 큐에
 *             넣지 않는다 — 항목 id 자체가 이미 gameId·dayIndex·victimUuid·source·계정·소켓
 *             세대로 유일하다(buildInGameKillRevealQueueItems 참고).
 *   queue   : 아직 재생하지 못한 대기 항목들(도착 순서 유지).
 *   active  : 지금 실제로 화면에 떠 있는 항목.
 *
 * 규칙:
 *   1. scope가 바뀌면(계정·게임·소켓 세대 변경) seenIds·queue·active를 전부 버린다.
 *   2. 새로 들어온 항목 중 이 scope에서 처음 보는 것만 큐 끝에 추가한다.
 *   3. active가 비어 있고 hold가 아니면 큐 맨 앞을 즉시 승격한다(같은 밤의 다음 희생자로
 *      바로 이어지며, 그 사이 DAY/NIGHT 진입 연출 같은 하위 우선순위가 끼어들지 않는다).
 *   4. active가 떠 있는데 hold가 걸리면(더 높은 우선순위 오버레이가 열림) 다시 큐 맨 앞으로
 *      되돌린다 — 소비된 것으로 치지 않는다.
 *
 * 반환값은 바뀐 것이 없으면 입력 state 참조를 그대로 돌려준다(리렌더 유발 없음).
 */

export const INITIAL_IN_GAME_KILL_REVEAL = Object.freeze({
  scope: null,
  seenIds: Object.freeze([]),
  queue: Object.freeze([]),
  active: null,
})

/**
 * 새로 관측된 항목들을 큐에 반영하고, 가능하면 다음 active를 승격한다.
 *
 * @param {object} state  현재 상태(INITIAL_IN_GAME_KILL_REVEAL 형태)
 * @param {object} input
 * @param {string|null} input.scope         현재 scope(null이면 연출 대상 세션 없음)
 * @param {Array<{id:string}>} [input.items] 이번에 새로 관측된 항목(중복 포함 가능)
 * @param {boolean} [input.hold]             더 높은 우선순위 오버레이(자기 역할 공개)가 떠 있는가
 */
export function reduceInGameKillReveal(state, input) {
  const { scope = null, items = [], hold = false } = input ?? {}

  const scopeChanged = scope !== state.scope
  let seenIds = scopeChanged ? [] : state.seenIds
  let queue = scopeChanged ? [] : state.queue
  let active = scopeChanged ? null : state.active

  const newItems = []
  for (const item of items) {
    if (item === null || typeof item !== "object") continue
    if (typeof item.id !== "string" || item.id.length === 0) continue
    if (seenIds.includes(item.id)) continue
    if (newItems.some((seen) => seen.id === item.id)) continue
    newItems.push(item)
  }

  if (newItems.length > 0) {
    seenIds = [...seenIds, ...newItems.map((item) => item.id)]
    queue = [...queue, ...newItems]
  }

  if (active === null && !hold && queue.length > 0) {
    active = queue[0]
    queue = queue.slice(1)
  } else if (active !== null && hold) {
    queue = [active, ...queue]
    active = null
  }

  if (!scopeChanged && seenIds === state.seenIds && queue === state.queue && active === state.active) {
    return state
  }
  return { scope, seenIds, queue, active }
}

/**
 * 지금 떠 있는 항목의 재생 완료(정상 종료 또는 명시적 continue)를 반영하고, 큐에 남은
 * 다음 항목이 있으면 곧바로 승격한다. 지금 active의 id와 정확히 일치할 때만 소비한다 —
 * 이전 항목(이미 넘어간 reveal)의 늦은 ended/watchdog/에러 콜백은 새로 뜬 reveal을 대신
 * 소비해버리지 않는다(exactly-once, stale-callback 보호).
 */
export function consumeInGameKillReveal(state, targetId) {
  if (state.active === null) return state
  if (typeof targetId !== "string" || targetId !== state.active.id) return state
  const nextActive = state.queue.length > 0 ? state.queue[0] : null
  const nextQueue = state.queue.length > 0 ? state.queue.slice(1) : state.queue
  return { ...state, active: nextActive, queue: nextQueue }
}
