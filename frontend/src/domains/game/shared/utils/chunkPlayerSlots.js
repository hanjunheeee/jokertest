/** 플레이어 슬롯 그리드 기본 열 수 (5열 × 2행 = 최대 10명) */
export const PLAYER_SLOT_COLUMNS = 5

/** slots를 columns개씩 잘라 2차원 행 배열로 변환 */
export function chunkPlayerSlots(slots, columns = PLAYER_SLOT_COLUMNS) {
  const rows = []

  for (let index = 0; index < slots.length; index += columns) {
    rows.push(slots.slice(index, index + columns))
  }

  return rows
}
