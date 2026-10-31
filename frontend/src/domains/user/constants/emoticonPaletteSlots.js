export const EMOTICON_PALETTE_SLOT_CLOCK_ORDER = [
  "12시", // index 0 → 1번
  "1~2시", // index 1 → 2번
  "3시", // index 2 → 3번
  "4~5시", // index 3 → 4번
  "6시", // index 4 → 5번
  "7~8시", // index 5 → 6번
  "9시", // index 6 → 7번
  "10~11시", // index 7 → 8번
]

export const toEmoticonPaletteSlotIndex = (slotNumber) => slotNumber - 1

export const toEmoticonPaletteSlotNumber = (index) => index + 1
