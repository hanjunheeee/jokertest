// 이모티콘 팔레트 스토어의 마이페이지 편집 액션 (불러오기·칸 고르기·넣기·저장·취소·초기화)
// emojiPalette.store.js가 create 안에서 펼쳐 씀
import { getEmojiPaletteApi, saveEmojiPaletteApi } from "../../api/emojiPalette.api.js"
import { EMOJI_PALETTE_SLOT_COUNT } from "../../constants/emoticonPaletteSlots.js"
import { assignSlot, normalizeSlots } from "../../utils/emoticonPalette/slots.js"
import { createInitialState, currentChecker } from "./state.js"
import { clearGameRequest } from "./gameActions.js"

export const editActions = (set, get) => ({
  load: async () => {
    set({ status: "loading", error: null, conflict: null })
    const isCurrent = currentChecker(get)

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

  // 편집은 불러오기가 끝난 뒤에만 받음
  selectSlot: (index) => {
    if (get().status !== "ready") return
    if (!Number.isInteger(index) || index < 0 || index >= EMOJI_PALETTE_SLOT_COUNT) return
    set({ selectedSlotIndex: index })
  },

  assignItem: (itemId) => {
    if (get().status !== "ready") return
    if (typeof itemId !== "string" || itemId.length === 0) return

    set((state) => ({ selectedSlots: assignSlot(state.selectedSlots, state.selectedSlotIndex, itemId) }))
  },

  // 버전 충돌이면 서버 칸으로 되돌리고 충돌 정보를 남김
  save: async () => {
    if (get().status !== "ready") return { ok: false, code: "NOT_READY" }

    const isCurrent = currentChecker(get)

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

  // 저장 안 한 편집을 버리고 마지막 저장 칸으로 돌림
  cancel: () => {
    if (get().status !== "ready") return
    set((state) => ({ selectedSlots: [...state.slots], conflict: null }))
  },

  // 세대를 올려 진행 중인 요청 결과를 버림
  reset: () => {
    clearGameRequest()
    return set((state) => ({
      ...createInitialState(),
      requestGeneration: state.requestGeneration + 1,
    }))
  },
})
