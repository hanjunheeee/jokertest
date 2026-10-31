export const INITIAL_IN_GAME_PHASE_ENTRANCE = Object.freeze({
  scope: null,
  seen: Object.freeze([]),
  pending: null,
  active: null,
})

export function reduceInGamePhaseEntrance(state, input) {
  const { scope = null, identity = null, phase = null, dayIndex = null, hold = false, hydrated = false } = input ?? {}

  const scopeChanged = scope !== state.scope
  let seen = scopeChanged ? [] : state.seen
  let pending = scopeChanged ? null : state.pending
  let active = scopeChanged ? null : state.active

  if (pending !== null && pending.identity !== identity) pending = null
  if (active !== null && active.identity !== identity) active = null

  if (identity !== null && !seen.includes(identity)) {
    seen = [...seen, identity]
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

export function confirmInGamePhaseEntrance(state, targetIdentity) {
  if (state.active === null) return state
  if (typeof targetIdentity !== "string" || targetIdentity !== state.active.identity) return state
  return { ...state, active: null }
}
