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
  ROOM_LIST_ROW_LOCK_BADGE_CLASS,
  ROOM_LIST_ROW_OVERLAY_CLASS,
  ROOM_LIST_ROW_SETTINGS_CLASS,
  ROOM_LIST_ROW_STAGE_BADGE_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_FULL_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_IN_PROGRESS_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_WRAP_CLASS,
  ROOM_LIST_ROW_TITLE_CLASS,
  ROOM_LIST_ROW_TOP_ROW_CLASS,
} from "../../constants/roomListLayout.js"
import { resolveRoomListRowCode } from "../../utils/resolveRoomListRowCode.js"
import { summarizeRoomListSettings } from "../../utils/summarizeRoomListSettings.js"
import PublicAsset from "../../../../../shared/ui/PublicAsset.jsx"

// 더미 stage 값을 화면에 보여줄 짧은 라벨로 바꿉니다(실제 게임 모드 체계가 아직 없어 임시 라벨).
const STAGE_LABELS = { 1: "1단계", 2: "2단계", 3: "3단계" }

// 공개 방 목록에서 방 하나를 보여주는 표시 전용 row입니다.
// room.displayStatus는 상위(RoomListShell)에서 deriveRoomDisplayStatus로 미리 계산해 내려줍니다.
export default function RoomListRow({ room, selected, onSelect }) {
  const { stage, current, max, title, displayStatus, settings } = room
  // F-20(AC-03): 서버가 승인한 직업 구성·제한시간 요약. 값이 없으면 아무것도 그리지 않는다.
  const settingsSummary = summarizeRoomListSettings(settings)

  const isFull = displayStatus === "full"
  const isInProgress = displayStatus === "in_progress"
  const isJoinable = !isFull && !isInProgress
  // 코드 방 배지에 무엇을 그릴지(코드 값 / "코드")는 utils/resolveRoomListRowCode.js가 정합니다.
  const rowCode = resolveRoomListRowCode(room)
  const stageLabel = STAGE_LABELS[stage]
  const statusLabel = isInProgress ? "진행중" : isFull ? "마감" : null

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
          <div className={ROOM_LIST_ROW_TOP_ROW_CLASS}>
            {stageLabel ? <span className={ROOM_LIST_ROW_STAGE_BADGE_CLASS}>{stageLabel}</span> : null}
            <span className={ROOM_LIST_ROW_STATUS_BADGE_WRAP_CLASS}>
              {/* 자물쇠 아이콘 에셋이 아직 없어 텍스트 배지로 대체합니다. */}
              {rowCode.visible ? (
                <span className={ROOM_LIST_ROW_LOCK_BADGE_CLASS}>{rowCode.label}</span>
              ) : null}
              {isInProgress ? (
                <span className={ROOM_LIST_ROW_STATUS_BADGE_IN_PROGRESS_CLASS}>진행중</span>
              ) : null}
              {isFull ? <span className={ROOM_LIST_ROW_STATUS_BADGE_FULL_CLASS}>마감</span> : null}
            </span>
          </div>

          <div className={ROOM_LIST_ROW_BOTTOM_ROW_CLASS}>
            <span className={ROOM_LIST_ROW_TITLE_CLASS}>{title}</span>
            {/* 설정 요약은 기존 제목과 인원 사이에 둔다 — 인원·마감 표시의 자리는 그대로다.
                전체 aria-label이 이미 같은 내용을 읽어주므로 이 시각 표시는 장식이다. */}
            {settingsSummary.roles || settingsSummary.times ? (
              <span className={ROOM_LIST_ROW_SETTINGS_CLASS}>
                {[settingsSummary.roles, settingsSummary.times].filter(Boolean).join(" / ")}
              </span>
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
