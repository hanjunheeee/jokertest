// 파일 역할: RoomListRow.jsx - 화면을 구성하는 컴포넌트입니다.
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import {
  ROOM_LIST_ROW_CLASS,
  ROOM_LIST_ROW_COUNT_CLASS,
  ROOM_LIST_ROW_FRAME_CLASS,
  ROOM_LIST_ROW_OVERLAY_CLASS,
  ROOM_LIST_ROW_TITLE_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 공개 방 목록에서 방 하나를 보여주는 row입니다.
export default function RoomListRow({ stage, current, max, title, onSelect }) {
  return (
    <li className={ROOM_LIST_ROW_CLASS}>
      <button
        type="button"
        onClick={onSelect}
        className="interactive-scale relative block w-full border-0 bg-transparent p-0 leading-none"
        aria-label={`${stage}스테이지 ${title}, ${current}/${max}명`}
      >
        <PublicAsset src={ROOM_LIST_ASSETS.rowFrame} alt="" className={ROOM_LIST_ROW_FRAME_CLASS} />
        <div className={ROOM_LIST_ROW_OVERLAY_CLASS} aria-hidden="true">
          <span className={ROOM_LIST_ROW_TITLE_CLASS}>{title}</span>
          <span className={ROOM_LIST_ROW_COUNT_CLASS}>{current}/{max}</span>
        </div>
      </button>
    </li>
  )
}
