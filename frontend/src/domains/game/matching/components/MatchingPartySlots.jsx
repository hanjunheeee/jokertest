// 대기방 자리 그림: 준비한 사람·안 한 사람 실루엣 + "준비완료"·"대기중" 글, 판 끝 뒤 비워 둔 방장 자리는 흐린 실루엣 + "방장 자리"
// MatchingPopupContent가 씀, 줄 나누기는 PlayerSlotGrid가 함
import PlayerSlotGrid from "./PlayerSlotGrid.jsx"
import { PLAYER_SLOT_COLUMNS } from "../utils/chunkPlayerSlots.js"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "../constants/gameMatchingAssets.js"
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

// 준비 표시 글: 실루엣 아래쪽에 겹쳐 둠 (칸 높이를 안 바꿔 자리 줄·아래 단추가 안 밀림)
// 그림 색만으로는 준비 여부를 알기 어려워 글과 이름표 색을 같이 다르게 함 (준비완료 = 밝은 바탕, 대기중 = 어두운 바탕)
const SEAT_BADGE_BASE_CLASS =
  "pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm border px-[0.35rem] py-[0.12rem] font-subheading app-text-scaled [--app-text-size:clamp(0.62rem,0.8vw,0.75rem)] font-bold leading-none"
const SEAT_BADGE_READY_CLASS = "border-[#6b4321]/60 bg-[#f5e6c8]/90 text-[#1a1008]"
const SEAT_BADGE_WAITING_CLASS = "border-[#3a2818]/70 bg-[#120a06]/85 text-[#f5f0e6]"

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
        <div key={slot.id} className={`relative ${SLOT_WRAP_CLASS}`}>
          <PublicAsset
            src={slot.ready ? GAME_MATCHING_ASSETS.silhouetteReady : GAME_MATCHING_ASSETS.silhouetteNotReady}
            alt={slot.ready ? "준비 완료한 참가자" : "준비 전 참가자"}
            className={`${slotClass}${slot.ready ? "" : ` ${SLOT_NOT_READY_OFFSET_CLASS}`}`}
          />
          {/* 화면 읽기는 그림 설명 글이 이미 읽어 줘서 이 글은 건너뜀 */}
          <span
            className={`${SEAT_BADGE_BASE_CLASS} ${slot.ready ? SEAT_BADGE_READY_CLASS : SEAT_BADGE_WAITING_CLASS}`}
            aria-hidden="true"
          >
            {slot.ready ? MATCHING_POPUP_COPY.readyBadge : MATCHING_POPUP_COPY.notReadyBadge}
          </span>
        </div>
      ))}
    />
  )
}
