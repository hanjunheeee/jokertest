export const INITIAL_IN_GAME_TRIBUNAL_EXPULSION = Object.freeze({
  scope: null,
  seenIds: Object.freeze([]),
  queue: Object.freeze([]),
  active: null,
})

export function reduceInGameTribunalExpulsionPresentation(state, input) {
  const { scope = null, items = [], hold = false } = input ?? {}

  const scopeChanged = scope !== state.scope
  let seenIds = scopeChanged ? [] : state.seenIds
  let queue = scopeChanged ? [] : state.queue
  let active = scopeChanged ? null : state.active

  const newItems = []
  for (const item of Array.isArray(items) ? items : []) {
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

export function consumeInGameTribunalExpulsionPresentation(state, targetId) {
  if (state.active === null) return state
  if (typeof targetId !== "string" || targetId.length === 0) return state
  if (state.active.id !== targetId) return state

  const queue = state.queue
  const active = queue.length > 0 ? queue[0] : null
  return {
    ...state,
    queue: active ? queue.slice(1) : [],
    active,
  }
}

export function hasPendingInGameTribunalExpulsionPresentation(state) {
  return state.active !== null || state.queue.length > 0
}
