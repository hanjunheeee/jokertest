export const INITIAL_IN_GAME_KILL_REVEAL = Object.freeze({
  scope: null,
  seenIds: Object.freeze([]),
  queue: Object.freeze([]),
  active: null,
})

export function reduceInGameKillReveal(state, input) {
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

export function consumeInGameKillReveal(state, targetId) {
  if (state.active === null) return state
  if (typeof targetId !== "string" || targetId !== state.active.id) return state
  const nextActive = state.queue.length > 0 ? state.queue[0] : null
  const nextQueue = state.queue.length > 0 ? state.queue.slice(1) : state.queue
  return { ...state, active: nextActive, queue: nextQueue }
}

export function hasPendingInGameKillReveal(state) {
  if (state === null || typeof state !== "object") return false
  if (state.active !== null && state.active !== undefined) return true
  return Array.isArray(state.queue) && state.queue.length > 0
}
