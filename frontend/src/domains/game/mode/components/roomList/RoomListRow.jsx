import { ROOM_LIST_ASSETS } from "../../constants/roomListAssets.js"
import {
  ROOM_LIST_ROW_BOTTOM_ROW_CLASS,
  ROW_BTN_BASE_CLASS,
  ROW_BTN_DISABLED_CLASS,
  ROW_BTN_INTERACTIVE_CLASS,
  ROOM_LIST_ROW_CLASS,
  ROW_COUNT_CLASS,
  ROW_DIM_OVERLAY_CLASS,
  ROOM_LIST_ROW_FRAME_CLASS,
  ROOM_LIST_ROW_FRAME_SELECTED_CLASS,
  ROOM_LIST_ROW_HEADER_DIVIDER_CLASS,
  ROOM_LIST_ROW_HEADER_ROW_CLASS,
  ROOM_LIST_ROW_LOCK_BADGE_CLASS,
  ROW_OVERLAY_CLASS,
  ROOM_LIST_ROW_SETTINGS_CLASS,
  ROW_STATUS_BADGE_FULL_CLASS,
  ROW_STATUS_BADGE_IN_PROGRESS_CLASS,
  ROW_STATUS_BADGE_WRAP_CLASS,
  ROOM_LIST_ROW_TITLE_CLASS,
} from "../../constants/roomListLayout.js"
import { resolveRoomListRowCode } from "../../utils/resolveRoomListRowCode.js"
import { summarizeRoomListSettings } from "../../utils/summarizeRoomListSettings.js"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"

const STAGE_LABELS = { 1: "1단계", 2: "2단계", 3: "3단계" }

export default function RoomListRow({ room, selected, onSelect }) {
  const { stage, current, max, title, displayStatus, settings } = room
  const settingsSummary = summarizeRoomListSettings(settings)
  const settingsLine = [settingsSummary.roles, settingsSummary.times].filter(Boolean).join(" / ")

  const isFull = displayStatus === "full"
  const isInProgress = displayStatus === "in_progress"
  const isJoinable = !isFull && !isInProgress
  const rowCode = resolveRoomListRowCode(room)
  const stageLabel = STAGE_LABELS[stage]
  const statusLabel = isInProgress ? "진행중" : isFull ? "마감" : null
  const showStatusBadges = rowCode.visible || isInProgress || isFull

  return (
    <li className={ROOM_LIST_ROW_CLASS}>
      <button
        type="button"
        onClick={isJoinable ? onSelect : undefined}
        disabled={!isJoinable}
        aria-pressed={selected}
        aria-label={`${stageLabel ? `${stageLabel} ` : ""}${title}, ${current}/${max}명${
          rowCode.ariaText ? `, ${rowCode.ariaText}` : ""
        }${settingsSummary.ariaText ? `, ${settingsSummary.ariaText}` : ""}${
          statusLabel ? `, ${statusLabel}` : ""
        }`}
        className={`${ROW_BTN_BASE_CLASS} ${
          isJoinable ? ROW_BTN_INTERACTIVE_CLASS : ROW_BTN_DISABLED_CLASS
        }`}
      >
        <PublicAsset
          src={ROOM_LIST_ASSETS.rowFrame}
          alt=""
          className={`${ROOM_LIST_ROW_FRAME_CLASS}${selected ? ` ${ROOM_LIST_ROW_FRAME_SELECTED_CLASS}` : ""}`}
        />

        <div className={ROW_OVERLAY_CLASS} aria-hidden="true">
          <div className={ROOM_LIST_ROW_HEADER_ROW_CLASS}>
            <span className={ROOM_LIST_ROW_TITLE_CLASS}>{title}</span>
            {showStatusBadges ? (
              <span className={ROW_STATUS_BADGE_WRAP_CLASS}>
                {rowCode.visible ? (
                  <span className={ROOM_LIST_ROW_LOCK_BADGE_CLASS}>{rowCode.label}</span>
                ) : null}
                {isInProgress ? (
                  <span className={ROW_STATUS_BADGE_IN_PROGRESS_CLASS}>진행중</span>
                ) : null}
                {isFull ? <span className={ROW_STATUS_BADGE_FULL_CLASS}>마감</span> : null}
              </span>
            ) : null}
          </div>

          <div className={ROOM_LIST_ROW_HEADER_DIVIDER_CLASS} />

          <div className={ROOM_LIST_ROW_BOTTOM_ROW_CLASS}>
            {settingsLine ? (
              <span className={ROOM_LIST_ROW_SETTINGS_CLASS}>{settingsLine}</span>
            ) : null}
            <span className={ROW_COUNT_CLASS}>
              {current}/{max}
            </span>
          </div>
        </div>

        {isFull || isInProgress ? <div className={ROW_DIM_OVERLAY_CLASS} /> : null}
      </button>
    </li>
  )
}
