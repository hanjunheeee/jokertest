// 이모티콘 팔레트 칸 상수 (시계 방향 칸 이름·칸 번호 바꾸기·칸 수)
// 이모티콘 팔레트 화면·스토어·칸 계산이 씀
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

export const toSlotIndex = (slotNumber) => slotNumber - 1

export const toSlotNumber = (index) => index + 1

// 이모티콘 팔레트 칸 수 (마이페이지 편집·인게임 팔레트 응답 정리)
export const EMOJI_PALETTE_SLOT_COUNT = 8
