// 이모지 말풍선 스토어: 사람별 지금 띄운 이모지와 정해진 시간 뒤 지우기
// 플레이어 보드가 읽고, 판 진행 이벤트 손잡이·연결 감시 훅이 넣고 지움
import { create } from "zustand"

import { subscribeIdentityScope } from "./ingameStore.js"

// 말풍선 보이는 시간 (시험도 이 값으로 시계를 돌림)
export const INGAME_EMOJI_BUBBLE_DURATION_MS = 3000

// 사람별 지우기 타이머 (스토어 밖에 둬서 다시 그리기 안 일으킴)
const timers = new Map()

// 그 사람 타이머 끄기
function clearBubbleTimer(uuid) {
  const timerId = timers.get(uuid)
  if (timerId === undefined) return
  clearTimeout(timerId)
  timers.delete(uuid)
}

// byUuid: uuid → { itemId, sentAt }
export const useInGameEmojiBubbleStore = create((set, get) => ({
  byUuid: {},

  // 말풍선 띄우기 (같은 사람이 또 보내면 앞 것 끄고 시간 다시 셈)
  setActiveEmoji: (uuid, itemId, sentAt) => {
    if (typeof uuid !== "string" || uuid.length === 0) return
    if (typeof itemId !== "string" || itemId.length === 0) return
    clearBubbleTimer(uuid)
    const shownAt = Number.isFinite(sentAt) ? sentAt : null
    set((state) => ({ byUuid: { ...state.byUuid, [uuid]: { itemId, sentAt: shownAt } } }))
    timers.set(uuid, setTimeout(() => {
      timers.delete(uuid)
      get().removeActiveEmoji(uuid)
    }, INGAME_EMOJI_BUBBLE_DURATION_MS))
  },

  // 한 사람 말풍선 지우기 (없으면 그대로)
  removeActiveEmoji: (uuid) => {
    clearBubbleTimer(uuid)
    set((state) => {
      if (!Object.hasOwn(state.byUuid, uuid)) return state
      const next = { ...state.byUuid }
      delete next[uuid]
      return { byUuid: next }
    })
  },

  // 전부 지우기 (다시 연결·신원 바뀜 때, 비었으면 그대로)
  clearAllActiveEmoji: () => {
    for (const timerId of timers.values()) clearTimeout(timerId)
    timers.clear()
    set((state) => (Object.keys(state.byUuid).length === 0 ? state : { byUuid: {} }))
  },
}))

// 판·본인·소속이 바뀌면 옛 판 말풍선이 남지 않게 지움
subscribeIdentityScope(() => {
  useInGameEmojiBubbleStore.getState().clearAllActiveEmoji()
})
