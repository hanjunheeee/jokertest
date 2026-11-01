// 방 카드 하나: 방 이름·코드/진행중/마감 표시·설정 요약·인원, 못 들어가는 방은 어둡게 잠금
// RoomCardList가 씀, 데스크톱 RoomListRow와 같은 판단(코드 배지·설정 요약)을 카드 모양으로
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import { resolveRoomListRowCode } from "@/domains/game/mode/utils/resolveRoomListRowCode.js"
import { summarizeRoomListSettings } from "@/domains/game/mode/utils/summarizeRoomListSettings.js"
import { publicAsset } from "@/shared/utils/publicAsset.js"

const STAGE_LABELS = { 1: "1단계", 2: "2단계", 3: "3단계" }

const BADGE_BASE = "rounded-sm px-[0.45em] py-[0.15em] font-subheading app-text-scaled [--app-text-size:0.72rem] font-bold leading-none"

// 비단 틀 그림을 카드 크기에 늘려 깔기
const FRAME_STYLE = {
  backgroundImage: `url("${publicAsset(ROOM_LIST_ASSETS.rowFrame)}")`,
  backgroundSize: "100% 100%",
}

// 방 카드 (room.displayStatus는 목록 훅이 붙여 줌)
export default function RoomCard({ room, selected, onSelect }) {
  const { stage, current, max, title, displayStatus, settings } = room
  const summary = summarizeRoomListSettings(settings)
  const rowCode = resolveRoomListRowCode(room)

  const isFull = displayStatus === "full"
  const isInProgress = displayStatus === "in_progress"
  const isJoinable = !isFull && !isInProgress
  const stageLabel = STAGE_LABELS[stage]
  const statusLabel = isInProgress ? "진행중" : isFull ? "마감" : null

  const ariaLabel = [
    `${stageLabel ? `${stageLabel} ` : ""}${title}, ${current}/${max}명`,
    rowCode.ariaText,
    summary.ariaText,
    statusLabel,
  ].filter(Boolean).join(", ")

  return (
    <li className="relative w-full min-w-0 list-none">
      <button
        type="button"
        onClick={isJoinable ? onSelect : undefined}
        disabled={!isJoinable}
        aria-pressed={selected}
        aria-label={ariaLabel}
        style={FRAME_STYLE}
        className={`relative flex min-h-[4.75rem] w-full flex-col justify-center gap-1 border-0 bg-transparent px-[7%] py-2.5 text-left leading-none transition duration-150 ${
          isJoinable ? "cursor-pointer active:brightness-110" : "cursor-not-allowed"
        } ${selected ? "brightness-[1.12] saturate-[1.42] hue-rotate-[-12deg] drop-shadow-[0_0_6px_rgba(160,28,28,0.95)]" : ""}`}
      >
        <span className="flex min-w-0 items-center justify-between gap-2" aria-hidden="true">
          <span className="min-w-0 flex-1 truncate font-subheading app-text-scaled [--app-text-size:1.02rem] font-bold leading-tight text-[#f3d28d] [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">
            {title}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {rowCode.visible ? (
              <span className={`${BADGE_BASE} border border-[#cbb27a]/50 bg-black/45 text-[#e8d5a8]`}>{rowCode.label}</span>
            ) : null}
            {isInProgress ? (
              <span className={`${BADGE_BASE} border border-[#b50000]/55 bg-[#2a0605]/70 text-[#ff8f87]`}>진행중</span>
            ) : null}
            {isFull ? <span className={`${BADGE_BASE} border border-white/25 bg-black/55 text-white/70`}>마감</span> : null}
          </span>
        </span>

        <span className="h-px w-full shrink-0 bg-white/30" aria-hidden="true" />

        <span className="flex min-w-0 items-end justify-between gap-2" aria-hidden="true">
          {/* 폰 폭에선 직업·시간을 두 줄로 */}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 font-subheading app-text-scaled [--app-text-size:0.74rem] font-medium leading-snug text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]">
            {summary.roles ? <span className="truncate">{summary.roles}</span> : null}
            {summary.times ? <span className="truncate">{summary.times}</span> : null}
          </span>
          <span className="shrink-0 font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold tabular-nums text-white/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]">
            {current}/{max}
          </span>
        </span>

        {!isJoinable ? <span className="pointer-events-none absolute inset-0 rounded-sm bg-black/55" aria-hidden="true" /> : null}
      </button>
    </li>
  )
}
