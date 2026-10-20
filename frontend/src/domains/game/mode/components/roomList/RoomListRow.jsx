// 파일 역할: RoomListRow.jsx - 화면을 구성하는 컴포넌트입니다.
// 이식한 화면 파일은 경로 별칭(@/) 대신 상대 경로를 씁니다 — node --test로 도는 순수 JS
// 테스트가 별칭을 해석하지 못해, 같은 import 체인을 테스트에서 그대로 따라갈 수 없기 때문입니다.
import { ROOM_LIST_ASSETS } from "../../constants/roomListAssets.js"
import {
  ROOM_LIST_ROW_BOTTOM_ROW_CLASS,
  ROOM_LIST_ROW_BUTTON_BASE_CLASS,
  ROOM_LIST_ROW_BUTTON_DISABLED_CLASS,
  ROOM_LIST_ROW_BUTTON_INTERACTIVE_CLASS,
  ROOM_LIST_ROW_CLASS,
  ROOM_LIST_ROW_COUNT_CLASS,
  ROOM_LIST_ROW_DIM_OVERLAY_CLASS,
  ROOM_LIST_ROW_FRAME_CLASS,
  ROOM_LIST_ROW_FRAME_SELECTED_CLASS,
  ROOM_LIST_ROW_HEADER_DIVIDER_CLASS,
  ROOM_LIST_ROW_HEADER_ROW_CLASS,
  ROOM_LIST_ROW_LOCK_BADGE_CLASS,
  ROOM_LIST_ROW_OVERLAY_CLASS,
  ROOM_LIST_ROW_SETTINGS_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_FULL_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_IN_PROGRESS_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_WRAP_CLASS,
  ROOM_LIST_ROW_TITLE_CLASS,
} from "../../constants/roomListLayout.js"
import { resolveRoomListRowCode } from "../../utils/resolveRoomListRowCode.js"
import { summarizeRoomListSettings } from "../../utils/summarizeRoomListSettings.js"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"

// 더미 stage 값을 aria-label에만 씁니다(실제 게임 모드 체계가 아직 없어 임시 라벨).
const STAGE_LABELS = { 1: "1단계", 2: "2단계", 3: "3단계" }

// 공개 방 목록에서 방 하나를 보여주는 표시 전용 row입니다.
// room.displayStatus는 상위(RoomListShell)에서 deriveRoomDisplayStatus로 미리 계산해 내려줍니다.
export default function RoomListRow({ room, selected, onSelect }) {
  const { stage, current, max, title, displayStatus, settings } = room
  // F-20(AC-03): 서버가 승인한 직업 구성·제한시간 요약. 값이 없으면 아무것도 그리지 않는다.
  const settingsSummary = summarizeRoomListSettings(settings)
  const settingsLine = [settingsSummary.roles, settingsSummary.times].filter(Boolean).join(" / ")

  const isFull = displayStatus === "full"
  const isInProgress = displayStatus === "in_progress"
  const isJoinable = !isFull && !isInProgress
  // 코드 방 배지에 무엇을 그릴지(코드 값 / "코드")는 utils/resolveRoomListRowCode.js가 정합니다.
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
        className={`${ROOM_LIST_ROW_BUTTON_BASE_CLASS} ${
          isJoinable ? ROOM_LIST_ROW_BUTTON_INTERACTIVE_CLASS : ROOM_LIST_ROW_BUTTON_DISABLED_CLASS
        }`}
      >
        <PublicAsset
          src={ROOM_LIST_ASSETS.rowFrame}
          alt=""
          className={`${ROOM_LIST_ROW_FRAME_CLASS}${selected ? ` ${ROOM_LIST_ROW_FRAME_SELECTED_CLASS}` : ""}`}
        />

        <div className={ROOM_LIST_ROW_OVERLAY_CLASS} aria-hidden="true">
          <div className={ROOM_LIST_ROW_HEADER_ROW_CLASS}>
            <span className={ROOM_LIST_ROW_TITLE_CLASS}>{title}</span>
            {showStatusBadges ? (
              <span className={ROOM_LIST_ROW_STATUS_BADGE_WRAP_CLASS}>
                {rowCode.visible ? (
                  <span className={ROOM_LIST_ROW_LOCK_BADGE_CLASS}>{rowCode.label}</span>
                ) : null}
                {isInProgress ? (
                  <span className={ROOM_LIST_ROW_STATUS_BADGE_IN_PROGRESS_CLASS}>진행중</span>
                ) : null}
                {isFull ? <span className={ROOM_LIST_ROW_STATUS_BADGE_FULL_CLASS}>마감</span> : null}
              </span>
            ) : null}
          </div>

          <div className={ROOM_LIST_ROW_HEADER_DIVIDER_CLASS} />

          <div className={ROOM_LIST_ROW_BOTTOM_ROW_CLASS}>
            {settingsLine ? (
              <span className={ROOM_LIST_ROW_SETTINGS_CLASS}>{settingsLine}</span>
            ) : null}
            <span className={ROOM_LIST_ROW_COUNT_CLASS}>
              {current}/{max}
            </span>
          </div>
        </div>

        {isFull || isInProgress ? <div className={ROOM_LIST_ROW_DIM_OVERLAY_CLASS} /> : null}
      </button>
    </li>
  )
}
