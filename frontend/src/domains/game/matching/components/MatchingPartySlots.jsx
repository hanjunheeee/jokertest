/**
 * 매칭 팝업 파티 슬롯 그리드 — 준비/미준비 실루엣을 5열·최대 2행으로 표시
 * MatchingPopupContent에서 slots 배열을 넘겨 사용
 *
 * props
 * - slots: { id, ready }[] — 준비 여부에 따라 실루엣 이미지 분기
 *
 * 6명 이상이면 2행·컴팩트 크기, 5명 이하는 1행·큰 크기
 * 스타일은 constants/matchingPopupStyles.js 참고
 */
import PlayerSlotGrid from "./PlayerSlotGrid.jsx"
import { PLAYER_SLOT_COLUMNS } from "../utils/chunkPlayerSlots.js"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import {
  MATCHING_SLOT_CLASS_COMPACT,
  MATCHING_SLOT_CLASS_LARGE,
  MATCHING_SLOT_NOT_READY_OFFSET_CLASS,
  MATCHING_SLOTS_GRID_CLASS,
  MATCHING_SLOTS_ROW_CLASS,
} from "../constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export { PLAYER_SLOT_COLUMNS as MATCHING_SLOT_COLUMNS }

/** 준비 상태별 실루엣을 행 단위로 렌더하는 파티 슬롯 그리드 */
export default function MatchingPartySlots({ slots = [] }) {
  const rowCount = Math.ceil(slots.length / PLAYER_SLOT_COLUMNS) || 1
  const slotClass =
    rowCount > 1 ? MATCHING_SLOT_CLASS_COMPACT : MATCHING_SLOT_CLASS_LARGE

  return (
    <PlayerSlotGrid
      slots={slots}
      columns={PLAYER_SLOT_COLUMNS}
      className={MATCHING_SLOTS_GRID_CLASS}
      rowClassName={MATCHING_SLOTS_ROW_CLASS}
      renderSlot={(slot) => (
        <PublicAsset
          key={slot.id}
          src={
            slot.ready
              ? GAME_MATCHING_ASSETS.silhouetteReady
              : GAME_MATCHING_ASSETS.silhouetteNotReady
          }
          alt={slot.ready ? "준비 완료" : "준비 중"}
          className={`${slotClass}${slot.ready ? "" : ` ${MATCHING_SLOT_NOT_READY_OFFSET_CLASS}`}`}
        />
      )}
    />
  )
}
