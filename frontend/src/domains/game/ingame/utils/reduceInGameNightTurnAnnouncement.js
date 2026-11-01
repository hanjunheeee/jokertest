// 밤 차례 안내 상태 바꾸기: 처음 보는 차례만 한 번 띄우고, 막히면 미뤄 둠
// 밤 차례 안내 훅(useInGameNightTurnAnnouncement)이 사용

// 처음 상태: 범위 없음, 본 것·기다림·띄운 것 없음
export const INITIAL_TURN_ANNOUNCEMENT = Object.freeze({
  scope: null,
  seen: Object.freeze([]),
  pending: null,
  active: null,
})

// 지금 차례 키로 다음 상태 (hold = 앞선 안내가 떠 있음, hydrated = 스냅샷을 막 받음)
export function reduceInGameNightTurnAnnouncement(state, input) {
  const { scope = null, identity = null, role = null, dayIndex = null, hold = false, hydrated = false } = input ?? {}

  // 범위(판·계정·연결)가 바뀌면 기록 다 버림
  const scopeChanged = scope !== state.scope
  let seen = scopeChanged ? [] : state.seen
  let pending = scopeChanged ? null : state.pending
  let active = scopeChanged ? null : state.active

  // 차례가 바뀌면 옛 안내는 버림
  if (pending !== null && pending.identity !== identity) pending = null
  if (active !== null && active.identity !== identity) active = null

  // 처음 보는 차례면 기록, 범위가 막 바뀌었거나 스냅샷으로 받은 차례면 안 띄움
  if (identity !== null && !seen.includes(identity)) {
    seen = [...seen, identity]
    if (!hydrated && !scopeChanged) {
      pending = { identity, role, dayIndex }
    }
  }

  // 막힘 없으면 기다리던 걸 띄움, 막히면 띄운 걸 다시 기다림으로
  if (pending !== null && active === null && !hold) {
    active = pending
    pending = null
  } else if (active !== null && hold) {
    pending = active
    active = null
  }

  // 바뀐 게 없으면 같은 상태 그대로 (다시 그리기 막기)
  if (!scopeChanged && seen === state.seen && pending === state.pending && active === state.active) {
    return state
  }
  return { scope, seen, pending, active }
}

// 띄운 안내 닫기 (같은 키일 때만)
export function dismissTurnAnnouncement(state, targetIdentity) {
  if (state.active === null) return state
  if (typeof targetIdentity !== "string" || targetIdentity !== state.active.identity) return state
  return { ...state, active: null }
}
