import { ROOM_LIST_ASSETS } from "@/domains/game/mode/constants/roomListAssets.js"
import {
  ACTION_BTN_CLASS,
  ACTION_FRAME_CLASS,
  ACTION_LABEL_CLASS,
} from "@/domains/game/mode/constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function RoomListActionButton({ label, onClick }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={ACTION_BTN_CLASS}>
      <PublicAsset src={ROOM_LIST_ASSETS.optionButton} alt="" className={ACTION_FRAME_CLASS} />
      <span className={ACTION_LABEL_CLASS}>{label}</span>
    </button>
  )
}