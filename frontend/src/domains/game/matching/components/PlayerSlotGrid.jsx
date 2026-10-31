import {
  PLAYER_SLOT_COLUMNS,
  chunkPlayerSlots,
} from "../utils/chunkPlayerSlots.js"

export default function PlayerSlotGrid({
  slots = [],
  columns = PLAYER_SLOT_COLUMNS,
  className = "",
  rowClassName = "",
  renderSlot,
}) {
  const rows = chunkPlayerSlots(slots, columns)

  return (
    <div className={className}>
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className={rowClassName}>
          {row.map((slot) => renderSlot(slot))}
        </div>
      ))}
    </div>
  )
}
