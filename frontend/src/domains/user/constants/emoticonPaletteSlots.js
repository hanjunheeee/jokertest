/**
 * 이모티콘 팔레트 8칸 슬롯 번호 규약.
 *
 * palette-frame.png 기준 **맨 위(12시)가 1번**, 시계 방향으로 8번까지.
 * store·서버 slots[]·selectedSlots[]·EMOTICON_PALETTE_SLOT_POSITIONS[]는 모두
 * **0-based 인덱스**를 쓰며, index N === (N+1)번 슬롯이다.
 *
 *        [1]
 *    [8]     [2]
 * [7]           [3]
 *    [6]     [4]
 *        [5]
 */
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

/** 1-based 슬롯 번호(1~8) → 0-based 배열 인덱스 */
export const toEmoticonPaletteSlotIndex = (slotNumber) => slotNumber - 1

/** 0-based 배열 인덱스 → 1-based 슬롯 번호(1~8) */
export const toEmoticonPaletteSlotNumber = (index) => index + 1
