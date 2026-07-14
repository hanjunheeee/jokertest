// 파일 역할: RoomListActionButton.jsx - 화면을 구성하는 컴포넌트입니다.
import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import {
  ROOM_LIST_ACTION_BTN_CLASS,
  ROOM_LIST_ACTION_FRAME_CLASS,
  ROOM_LIST_ACTION_LABEL_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 방 목록 화면 상단의 "게임 만들기", "게임 찾기" 버튼입니다.
export default function RoomListActionButton({ label, onClick }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={ROOM_LIST_ACTION_BTN_CLASS}>
      <PublicAsset src={ROOM_LIST_ASSETS.optionButton} alt="" className={ROOM_LIST_ACTION_FRAME_CLASS} />
      <span className={ROOM_LIST_ACTION_LABEL_CLASS}>{label}</span>
    </button>
  )
}
