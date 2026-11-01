// 이모티콘 팔레트 칸 상수 (시계 방향 칸 이름·칸 번호 바꾸기·칸 수)
// 이모티콘 팔레트 바퀴(EmoticonPaletteWheel)·스토어·칸 계산이 씀

// 칸 이름 (12시부터 시계 방향, 지금 아무도 안 씀)
export const CLOCK_ORDER = [
  "12시",
  "1~2시",
  "3시",
  "4~5시",
  "6시",
  "7~8시",
  "9시",
  "10~11시",
]

// 칸 번호(1부터) → 배열 자리 (지금 아무도 안 씀)
export const toSlotIndex = (slotNumber) => slotNumber - 1

// 배열 자리 → 칸 번호(1부터), 칸 이름표에 씀
export const toSlotNumber = (index) => index + 1

// 이모티콘 팔레트 칸 수 (마이페이지 편집·인게임 팔레트 응답 정리)
export const EMOJI_PALETTE_SLOT_COUNT = 8
