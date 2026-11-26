// 대기방 자리 그림: 한 줄 5칸, 준비완료·대기중 배지 및 비워 둔 방장 자리 표시
// MatchingBoard가 틀 안에 사용, 줄 나누기·접근성 이름·test id는 데스크톱 MatchingPartySlots와 맞춤
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { PLAYER_SLOT_COLUMNS, chunkPlayerSlots } from "@/domains/game/matching/utils/chunkPlayerSlots.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
  RESERVED_HOST_IMG_CLASS,
  RESERVED_HOST_LABEL_CLASS,
  SEAT_BADGE_BASE_CLASS,
  SEAT_BADGE_READY_CLASS,
  SEAT_BADGE_WAITING_CLASS,
  SLOT_COMPACT_CLASS,
  SLOT_LARGE_CLASS,
  SLOT_NOT_READY_OFFSET_CLASS,
} from "../../constants/matchingMobileStyles.js"

// 자리 줄 묶음 (두 줄 이상이면 작은 그림, 예약석은 흐린 실루엣과 방장 자리 이름표 표시)
export default function SlotGrid({ slots = [] }) {
  const rows = chunkPlayerSlots(slots, PLAYER_SLOT_COLUMNS)
  const slotClass = rows.length > 1 ? SLOT_COMPACT_CLASS : SLOT_LARGE_CLASS

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[1.3cqw]">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex items-end justify-center gap-[2.1cqw]">
          {row.map((slot) => (
            slot.reservedHost ? (
              <div
                key={slot.id}
                className="relative flex flex-col items-center"
                data-reserved-host=""
                data-testid="matching-reserved-host-slot"
              >
                <PublicAsset
                  src={GAME_MATCHING_ASSETS.silhouetteNotReady}
                  alt="비워 둔 방장 자리"
                  className={`${slotClass} ${SLOT_NOT_READY_OFFSET_CLASS} ${RESERVED_HOST_IMG_CLASS}`}
                />
                <span className={RESERVED_HOST_LABEL_CLASS} aria-hidden="true">방장 자리</span>
              </div>
            ) : (
              <div
                key={slot.id}
                className="relative flex flex-col items-center"
                data-ready={slot.ready ? "" : undefined}
              >
                <PublicAsset
                  src={slot.ready ? GAME_MATCHING_ASSETS.silhouetteReady : GAME_MATCHING_ASSETS.silhouetteNotReady}
                  alt={slot.ready ? "준비 완료한 참가자" : "준비 전 참가자"}
                  className={`${slotClass}${slot.ready ? "" : ` ${SLOT_NOT_READY_OFFSET_CLASS}`}`}
                />
                <span
                  className={`${SEAT_BADGE_BASE_CLASS} ${slot.ready ? SEAT_BADGE_READY_CLASS : SEAT_BADGE_WAITING_CLASS}`}
                  aria-hidden="true"
                >
                  {slot.ready ? MATCHING_POPUP_COPY.readyBadge : MATCHING_POPUP_COPY.notReadyBadge}
                </span>
              </div>
            )
          ))}
        </div>
      ))}
    </div>
  )
}
