// 이모티콘 팔레트 칸 계산 (빈 칸 만들기·서버 칸 정리·칸에 넣으며 겹치면 자리 바꾸기)
// 이모티콘 팔레트 스토어가 씀
import { EMOJI_PALETTE_SLOT_COUNT } from "../../constants/emoticonPaletteSlots.js"

export const emptySlots = () => Array.from({ length: EMOJI_PALETTE_SLOT_COUNT }, () => null)

// 칸 수를 맞추고 빈 문자열·문자열 아닌 값은 빈 칸으로 바꿈
export const normalizeSlots = (slots) => {
  const base = emptySlots()
  if (!Array.isArray(slots)) return base
  return base.map((_, index) => {
    const value = slots[index]
    return typeof value === "string" && value.length > 0 ? value : null
  })
}

// 같은 이모티콘이 다른 칸에 있으면 그 칸에는 원래 있던 것을 넣어 자리를 바꿈
export const assignSlot = (slots, index, itemId) => {
  const next = [...slots]
  const previous = next[index]
  const duplicateIndex = next.findIndex((value, slot) => slot !== index && value === itemId)
  next[index] = itemId
  if (duplicateIndex !== -1) next[duplicateIndex] = previous
  return next
}
