export const PLAYER_SLOT_COLUMNS = 5

export function chunkPlayerSlots(slots, columns = PLAYER_SLOT_COLUMNS) {
  const rows = []

  for (let index = 0; index < slots.length; index += columns) {
    rows.push(slots.slice(index, index + columns))
  }

  return rows
}
