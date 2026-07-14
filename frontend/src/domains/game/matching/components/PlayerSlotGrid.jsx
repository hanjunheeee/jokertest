// 파일 역할: PlayerSlotGrid.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  PLAYER_SLOT_COLUMNS,
  chunkPlayerSlots,
} from "../utils/chunkPlayerSlots.js"

/**
 * N열 플레이어 슬롯 그리드 — MatchingPartySlots 등 매칭 UI용
 *
 * props
 * - slots: 슬롯 데이터 배열
 * - columns: 한 행 열 수 (기본 5)
 * - className, rowClassName: 그리드·행 wrapper 클래스
 * - renderSlot: (slot) => ReactNode
 */
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
