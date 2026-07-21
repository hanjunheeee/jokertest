// 파일 역할: RoomListRow.jsx - 화면을 구성하는 컴포넌트입니다.
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import {
  ROOM_LIST_ROW_BOTTOM_ROW_CLASS,
  ROOM_LIST_ROW_BUTTON_BASE_CLASS,
  ROOM_LIST_ROW_BUTTON_DISABLED_CLASS,
  ROOM_LIST_ROW_BUTTON_INTERACTIVE_CLASS,
  ROOM_LIST_ROW_CLASS,
  ROOM_LIST_ROW_COUNT_CLASS,
  ROOM_LIST_ROW_DIM_OVERLAY_CLASS,
  ROOM_LIST_ROW_FRAME_CLASS,
  ROOM_LIST_ROW_LOCK_BADGE_CLASS,
  ROOM_LIST_ROW_OVERLAY_CLASS,
  ROOM_LIST_ROW_SELECTED_RING_CLASS,
  ROOM_LIST_ROW_STAGE_BADGE_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_FULL_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_IN_PROGRESS_CLASS,
  ROOM_LIST_ROW_STATUS_BADGE_WRAP_CLASS,
  ROOM_LIST_ROW_TITLE_CLASS,
  ROOM_LIST_ROW_TOP_ROW_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 더미 stage 값을 화면에 보여줄 짧은 라벨로 바꿉니다(실제 게임 모드 체계가 아직 없어 임시 라벨).
const STAGE_LABELS = { 1: "1단계", 2: "2단계", 3: "3단계" }

// 공개 방 목록에서 방 하나를 보여주는 표시 전용 row입니다.
// room.displayStatus는 상위(RoomListShell)에서 deriveRoomDisplayStatus로 미리 계산해 내려줍니다.
export default function RoomListRow({ room, selected, onSelect }) {
  const { stage, current, max, title, accessType, displayStatus } = room

  const isFull = displayStatus === "full"
  const isInProgress = displayStatus === "in_progress"
  const isJoinable = !isFull && !isInProgress
  const isCode = accessType === "code"
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
          isCode ? ", 코드 필요" : ""
        }${statusLabel ? `, ${statusLabel}` : ""}`}
        className={`${ROOM_LIST_ROW_BUTTON_BASE_CLASS} ${
          isJoinable ? ROOM_LIST_ROW_BUTTON_INTERACTIVE_CLASS : ROOM_LIST_ROW_BUTTON_DISABLED_CLASS
        }`}
      >
        <PublicAsset src={ROOM_LIST_ASSETS.rowFrame} alt="" className={ROOM_LIST_ROW_FRAME_CLASS} />

        <div className={ROOM_LIST_ROW_OVERLAY_CLASS} aria-hidden="true">
          <div className={ROOM_LIST_ROW_TOP_ROW_CLASS}>
            {stageLabel ? <span className={ROOM_LIST_ROW_STAGE_BADGE_CLASS}>{stageLabel}</span> : null}
            <span className={ROOM_LIST_ROW_STATUS_BADGE_WRAP_CLASS}>
              {/* 자물쇠 아이콘 에셋이 아직 없어 텍스트 배지로 대체합니다. */}
              {isCode ? <span className={ROOM_LIST_ROW_LOCK_BADGE_CLASS}>코드</span> : null}
              {isInProgress ? (
                <span className={ROOM_LIST_ROW_STATUS_BADGE_IN_PROGRESS_CLASS}>진행중</span>
              ) : null}
              {isFull ? <span className={ROOM_LIST_ROW_STATUS_BADGE_FULL_CLASS}>마감</span> : null}
            </span>
          </div>

          <div className={ROOM_LIST_ROW_BOTTOM_ROW_CLASS}>
            <span className={ROOM_LIST_ROW_TITLE_CLASS}>{title}</span>
            <span className={ROOM_LIST_ROW_COUNT_CLASS}>
              {current}/{max}
            </span>
          </div>
        </div>

        {isFull || isInProgress ? <div className={ROOM_LIST_ROW_DIM_OVERLAY_CLASS} /> : null}
        {selected ? <div className={ROOM_LIST_ROW_SELECTED_RING_CLASS} /> : null}
      </button>
    </li>
  )
}
