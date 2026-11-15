// 대기방 자리 그림: 준비한 사람·안 한 사람 실루엣 구분, 판 끝 뒤 비워 둔 방장 자리는 흐린 실루엣 + "방장 자리"
// MatchingPopupContent가 씀, 줄 나누기는 PlayerSlotGrid가 함
import PlayerSlotGrid from "./PlayerSlotGrid.jsx"
import { PLAYER_SLOT_COLUMNS } from "../utils/chunkPlayerSlots.js"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import {
  SLOT_CLASS_COMPACT,
  SLOT_CLASS_LARGE,
  SLOT_NOT_READY_OFFSET_CLASS,
  SLOT_WRAP_CLASS,
  SLOTS_GRID_CLASS,
  SLOTS_ROW_CLASS,
} from "../../../../shared/constants/matchingPopupStyles.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 방장 자리 칸: 실루엣은 흐리게, 이름표는 실루엣 가운데 밝은 바탕 진한 글자 (칸 높이를 안 바꿔 다른 칸과 줄 맞춤)
const RESERVED_HOST_IMG_CLASS = "opacity-40 grayscale"
const RESERVED_HOST_LABEL_CLASS =
  "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-sm border border-[#6b4321]/60 bg-[#f5e6c8]/90 px-[0.4rem] py-[0.15rem] font-subheading app-text-scaled [--app-text-size:clamp(0.72rem,0.95vw,0.86rem)] font-bold leading-none text-[#1a1008]"

// 한 줄 칸 수를 MATCHING_SLOT_COLUMNS 이름으로도 내보냄 (지금 부르는 곳 없음)
export { PLAYER_SLOT_COLUMNS as MATCHING_SLOT_COLUMNS }

// 자리 그림 묶음
export default function MatchingPartySlots({ slots = [] }) {
  // 두 줄 이상이면 작은 그림 씀 (팝업 안에 맞추기)
  const rowCount = Math.ceil(slots.length / PLAYER_SLOT_COLUMNS) || 1
  const slotClass = rowCount > 1 ? SLOT_CLASS_COMPACT : SLOT_CLASS_LARGE

  return (
    <PlayerSlotGrid
      slots={slots}
      columns={PLAYER_SLOT_COLUMNS}
      className={SLOTS_GRID_CLASS}
      rowClassName={SLOTS_ROW_CLASS}
      renderSlot={(slot) => (slot.reservedHost ? (
        <div key={slot.id} className={`relative ${SLOT_WRAP_CLASS}`} data-reserved-host="" data-testid="matching-reserved-host-slot">
          <PublicAsset
            src={GAME_MATCHING_ASSETS.silhouetteNotReady}
            alt="비워 둔 방장 자리"
            className={`${slotClass} ${SLOT_NOT_READY_OFFSET_CLASS} ${RESERVED_HOST_IMG_CLASS}`}
          />
          <span className={RESERVED_HOST_LABEL_CLASS} aria-hidden="true">방장 자리</span>
        </div>
      ) : (
        <div key={slot.id} className={SLOT_WRAP_CLASS}>
          <PublicAsset
            src={slot.ready ? GAME_MATCHING_ASSETS.silhouetteReady : GAME_MATCHING_ASSETS.silhouetteNotReady}
            alt={slot.ready ? "준비 완료한 참가자" : "준비 전 참가자"}
            className={`${slotClass}${slot.ready ? "" : ` ${SLOT_NOT_READY_OFFSET_CLASS}`}`}
          />
        </div>
      ))}
    />
  )
}
