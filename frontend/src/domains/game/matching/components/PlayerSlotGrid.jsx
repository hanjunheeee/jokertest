// 자리 목록을 한 줄 N칸씩 끊어 그리는 틀
// MatchingPartySlots가 씀, 칸 모양은 renderSlot으로 받음
import {
  PLAYER_SLOT_COLUMNS,
  chunkPlayerSlots,
} from "../utils/chunkPlayerSlots.js"

// 줄 나눠 그리기 (칸 수 기본 5)
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
