// 재판 추방 연출 줄 세우기: 처음 보는 항목만 줄에 넣고 하나씩 띄우기·넘기기
// 재판 추방 연출 훅(useInGameTribunalExpulsionPresentation)이 사용

// 처음 상태: 범위 없음, 본 id·줄·띄운 것 없음
export const INITIAL_IN_GAME_TRIBUNAL_EXPULSION = Object.freeze({
  scope: null,
  seenIds: Object.freeze([]),
  queue: Object.freeze([]),
  active: null,
})

// 범위·새 항목·막힘(hold)으로 다음 상태 (새 항목은 줄 뒤에)
export function reduceInGameTribunalExpulsionPresentation(state, input) {
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

// 띄운 연출을 다 봄: 같은 id일 때만 다음 항목 띄움
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

// 띄운 것이나 기다리는 것이 남았는지
export function hasPendingInGameTribunalExpulsionPresentation(state) {
  return state.active !== null || state.queue.length > 0
}
