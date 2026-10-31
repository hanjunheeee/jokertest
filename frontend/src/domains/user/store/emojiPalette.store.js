import { create } from "zustand"

import { getEmojiPaletteApi, saveEmojiPaletteApi } from "../api/emojiPalette.api.js"
import { useAuthStore } from "../../auth/store/auth.store.js"
import {
  inGameEmojiScopeKey,
  readInGameEmojiScope,
} from "../../game/ingame/utils/selectInGameEmojiScope.js"
import { useInGameStore } from "../../game/ingame/store/ingameStore.js"

export const EMOJI_PALETTE_SLOT_COUNT = 8

const emptySlots = () => Array.from({ length: EMOJI_PALETTE_SLOT_COUNT }, () => null)

const normalizeSlots = (slots) => {
  const base = emptySlots()
  if (!Array.isArray(slots)) return base
  return base.map((_, index) => {
    const value = slots[index]
    return typeof value === "string" && value.length > 0 ? value : null
  })
}

const createInitialState = () => ({
  slots: emptySlots(),
  revision: null,
  owned: [],
  selectedSlots: emptySlots(),
  selectedSlotIndex: 0,
  status: "idle", // idle | loading | ready | error
  error: null,
  conflict: null,
  gameSlots: null,
  gameScopeKey: null,
  gameStatus: "idle", // idle | loading | ready | error
})

let gamePendingKey = null
let gamePendingPromise = null

let gamePendingToken = null
let gameRequestSeq = 0

function clearGamePaletteRequest() {
  gamePendingKey = null
  gamePendingPromise = null
  gamePendingToken = null
}

export const useEmojiPaletteStore = create((set, get) => ({
  ...createInitialState(),
  requestGeneration: 0,

  load: async () => {
    set({ status: "loading", error: null, conflict: null })
    const generation = get().requestGeneration
    const identityGeneration = useAuthStore.getState().identityGeneration
    const isCurrent = () => get().requestGeneration === generation
      && useAuthStore.getState().identityGeneration === identityGeneration

    try {
      const response = await getEmojiPaletteApi()
      if (!isCurrent()) return { ok: false, stale: true }

      const slots = normalizeSlots(response?.slots)
      set({
        slots,
        selectedSlots: [...slots],
        selectedSlotIndex: 0,
        revision: typeof response?.revision === "string" ? response.revision : null,
        owned: Array.isArray(response?.owned) ? [...response.owned] : [],
        status: "ready",
        error: null,
        conflict: null,
      })
      return { ok: true }
    } catch (error) {
      if (!isCurrent()) return { ok: false, stale: true }
      set({ status: "error", error })
      return { ok: false, code: error?.code, error }
    }
  },

  loadForGame: async (scope = null) => {
    const liveScope = readInGameEmojiScope()
    const key = inGameEmojiScopeKey(liveScope)
    if (key === null) return { ok: false, code: "NO_GAME_SCOPE" }
    if (scope !== null && inGameEmojiScopeKey(scope) !== key) return { ok: false, stale: true }

    const current = get()
    if (current.gameScopeKey === key && current.gameStatus === "ready") {
      return { ok: true, cached: true, slots: current.gameSlots }
    }
    if (gamePendingKey === key && gamePendingPromise !== null) return gamePendingPromise

    clearGamePaletteRequest()
    gameRequestSeq += 1
    const token = gameRequestSeq
    gamePendingKey = key
    gamePendingToken = token
    set({ gameScopeKey: key, gameStatus: "loading", gameSlots: null })

    const isCurrent = () => gamePendingToken === token
      && inGameEmojiScopeKey(readInGameEmojiScope()) === key
      && get().gameScopeKey === key

    const pending = (async () => {
      try {
        const response = await getEmojiPaletteApi()
        if (!isCurrent()) return { ok: false, stale: true }
        const slots = normalizeSlots(response?.slots)
        set({ gameSlots: slots, gameStatus: "ready" })
        return { ok: true, slots }
      } catch (error) {
        if (!isCurrent()) return { ok: false, stale: true }
        set({ gameStatus: "error" })
        return { ok: false, code: error?.code, error }
      } finally {
        if (gamePendingToken === token) clearGamePaletteRequest()
      }
    })()

    gamePendingPromise = pending
    return pending
  },

  resetGamePalette: () => {
    clearGamePaletteRequest()
    set((state) => {
      if (state.gameScopeKey === null && state.gameSlots === null && state.gameStatus === "idle") {
        return state
      }
      return { gameSlots: null, gameScopeKey: null, gameStatus: "idle" }
    })
  },

  selectSlot: (index) => {
    if (get().status !== "ready") return
    if (!Number.isInteger(index) || index < 0 || index >= EMOJI_PALETTE_SLOT_COUNT) return
    set({ selectedSlotIndex: index })
  },

  assignItem: (itemId) => {
    if (get().status !== "ready") return
    if (typeof itemId !== "string" || itemId.length === 0) return

    set((state) => {
      const index = state.selectedSlotIndex
      const next = [...state.selectedSlots]
      const previous = next[index]
      const duplicateIndex = next.findIndex((value, slot) => slot !== index && value === itemId)
      next[index] = itemId
      if (duplicateIndex !== -1) next[duplicateIndex] = previous
      return { selectedSlots: next }
    })
  },

  save: async () => {
    if (get().status !== "ready") return { ok: false, code: "NOT_READY" }

    const generation = get().requestGeneration
    const identityGeneration = useAuthStore.getState().identityGeneration
    const isCurrent = () => get().requestGeneration === generation
      && useAuthStore.getState().identityGeneration === identityGeneration

    const slots = [...get().selectedSlots]
    const expectedRevision = get().revision

    try {
      const response = await saveEmojiPaletteApi({ slots, expectedRevision })
      if (!isCurrent()) return { ok: false, stale: true }

      const savedSlots = normalizeSlots(response?.slots ?? slots)
      const revision = typeof response?.revision === "string" ? response.revision : null
      set({ slots: savedSlots, selectedSlots: [...savedSlots], revision, conflict: null, error: null })
      return { ok: true, revision, slots: savedSlots }
    } catch (error) {
      if (!isCurrent()) return { ok: false, stale: true }

      if (error?.revision !== undefined) {
        const conflictSlots = normalizeSlots(error.slots)
        set({
          slots: conflictSlots,
          selectedSlots: [...conflictSlots],
          revision: error.revision,
          conflict: { revision: error.revision, slots: conflictSlots },
        })
        return { ok: false, code: error.code, status: error.status, revision: error.revision, slots: conflictSlots }
      }
      return { ok: false, code: error?.code, status: error?.status }
    }
  },

  cancel: () => {
    if (get().status !== "ready") return
    set((state) => ({ selectedSlots: [...state.slots], conflict: null }))
  },

  reset: () => {
    clearGamePaletteRequest()
    return set((state) => ({
      ...createInitialState(),
      requestGeneration: state.requestGeneration + 1,
    }))
  },
}))

useAuthStore.subscribe((state, prevState) => {
  if (state.identityGeneration !== prevState?.identityGeneration) {
    useEmojiPaletteStore.getState().reset()
  }
})

useInGameStore.subscribe(() => {
  const state = useEmojiPaletteStore.getState()
  if (state.gameScopeKey === null && state.gameStatus === "idle") return
  if (inGameEmojiScopeKey(readInGameEmojiScope()) === state.gameScopeKey) return
  useEmojiPaletteStore.getState().resetGamePalette()
})
