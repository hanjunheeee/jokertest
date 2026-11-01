// 사망 공개 줄 세우기: 처음 보는 항목만 줄에 넣고 하나씩 띄우기·넘기기
// 사망 공개 훅(useInGameKillReveal)이 사용 (그 훅은 지금 화면에 안 붙음)

// 처음 상태: 범위 없음, 본 id·줄·띄운 것 없음
export const INITIAL_IN_GAME_KILL_REVEAL = Object.freeze({
  scope: null,
  seenIds: Object.freeze([]),
  queue: Object.freeze([]),
  active: null,
})

// 범위·새 항목·막힘(hold)으로 다음 상태 (새 항목은 줄 뒤에)
export function reduceInGameKillReveal(state, input) {
  const { scope = null, items = [], hold = false } = input ?? {}

  // 범위(판·계정·연결)가 바뀌면 본 기록·줄·띄운 것 다 버림
  const scopeChanged = scope !== state.scope
  let seenIds = scopeChanged ? [] : state.seenIds
  let queue = scopeChanged ? [] : state.queue
  let active = scopeChanged ? null : state.active

  // 모양이 틀리거나 이미 본 id·같은 묶음 안 중복이면 뺌
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

  // 막힘 없으면 줄 맨 앞을 띄움, 막히면 띄운 걸 줄 앞으로 되돌림
  if (active === null && !hold && queue.length > 0) {
    active = queue[0]
    queue = queue.slice(1)
  } else if (active !== null && hold) {
    queue = [active, ...queue]
    active = null
  }

  // 바뀐 게 없으면 같은 상태 그대로 (다시 그리기 막기)
  if (!scopeChanged && seenIds === state.seenIds && queue === state.queue && active === state.active) {
    return state
  }
  return { scope, seenIds, queue, active }
}

// 띄운 항목을 다 봄: 같은 id일 때만 다음 항목 띄움
export function consumeInGameKillReveal(state, targetId) {
  if (state.active === null) return state
  if (typeof targetId !== "string" || targetId !== state.active.id) return state
  const nextActive = state.queue.length > 0 ? state.queue[0] : null
  const nextQueue = state.queue.length > 0 ? state.queue.slice(1) : state.queue
  return { ...state, active: nextActive, queue: nextQueue }
}

// 띄운 것이나 기다리는 것이 남았는지
export function hasPendingInGameKillReveal(state) {
  if (state === null || typeof state !== "object") return false
  if (state.active !== null && state.active !== undefined) return true
  return Array.isArray(state.queue) && state.queue.length > 0
}
