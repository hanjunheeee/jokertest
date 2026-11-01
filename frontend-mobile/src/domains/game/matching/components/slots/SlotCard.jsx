// 대기방 자리 카드 하나: 준비/미준비 실루엣·이름·준비 상태·방장/나 표시
// SlotGrid가 씀, 실루엣 그림은 데스크톱 자리 그림과 같음
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { GAME_MATCHING_ASSETS, MATCHING_POPUP_COPY } from "@/domains/game/matching/constants/gameMatchingAssets.js"
import { SLOT_COPY } from "../../constants/matchingMobileStyles.js"

// 작은 표시 띠 (방장·나)
const TAG_CLASS =
  "shrink-0 rounded px-1.5 py-0.5 font-subheading app-text-scaled [--app-text-size:0.7rem] font-bold leading-none"

// 자리 카드 (준비하면 테두리·글자색으로 구분)
export default function SlotCard({ slot }) {
  const name = slot.nickname ?? SLOT_COPY.unknownName
  const stateLabel = slot.ready ? MATCHING_POPUP_COPY.readyBadge : MATCHING_POPUP_COPY.notReadyBadge

  return (
    <li
      className={`flex min-h-[3.75rem] min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 short:min-h-[3.25rem] land:min-h-[3rem] ${
        slot.ready
          ? "border-[#3f5a2a] bg-[#a9b47a]/45"
          : "border-[#8b7355]/70 bg-[#b9a072]/45"
      }`}
      aria-label={`${name} ${stateLabel}${slot.isHost ? ` ${SLOT_COPY.host}` : ""}`}
      data-ready={slot.ready ? "" : undefined}
    >
      <PublicAsset
        src={slot.ready ? GAME_MATCHING_ASSETS.silhouetteReady : GAME_MATCHING_ASSETS.silhouetteNotReady}
        alt=""
        className="h-11 w-11 shrink-0 select-none object-contain short:h-9 short:w-9 land:h-9 land:w-9"
      />
      <div className="min-w-0 flex-1" aria-hidden="true">
        <div className="flex min-w-0 items-center gap-1">
          <p className="truncate font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold leading-tight text-[#1a1008]">
            {name}
          </p>
          {slot.isMe ? <span className={`${TAG_CLASS} bg-[#1a1008]/75 text-[#f5f0e6]`}>{SLOT_COPY.me}</span> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          <span
            className={`whitespace-nowrap font-subheading app-text-scaled [--app-text-size:0.78rem] font-bold leading-tight ${
              slot.ready ? "text-[#2f4a1c]" : "text-[#5a4632]"
            }`}
          >
            {stateLabel}
          </span>
          {slot.isHost ? <span className={`${TAG_CLASS} bg-[#b50000] text-[#f5f0e6]`}>{SLOT_COPY.host}</span> : null}
        </div>
      </div>
    </li>
  )
}
