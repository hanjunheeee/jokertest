import { create } from "zustand"

import { subscribeInGameIdentityScope } from "./ingameStore.js"

export const INGAME_EMOJI_BUBBLE_DURATION_MS = 3000

const timers = new Map()

function clearBubbleTimer(uuid) {
  const timerId = timers.get(uuid)
  if (timerId === undefined) return
  clearTimeout(timerId)
  timers.delete(uuid)
}

export const useInGameEmojiBubbleStore = create((set, get) => ({
  byUuid: {},

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

  removeActiveEmoji: (uuid) => {
    clearBubbleTimer(uuid)
    set((state) => {
      if (!Object.hasOwn(state.byUuid, uuid)) return state
      const next = { ...state.byUuid }
      delete next[uuid]
      return { byUuid: next }
    })
  },

  clearAllActiveEmoji: () => {
    for (const timerId of timers.values()) clearTimeout(timerId)
    timers.clear()
    set((state) => (Object.keys(state.byUuid).length === 0 ? state : { byUuid: {} }))
  },
}))

subscribeInGameIdentityScope(() => {
  useInGameEmojiBubbleStore.getState().clearAllActiveEmoji()
})
