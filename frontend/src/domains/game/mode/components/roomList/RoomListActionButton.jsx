import { ROOM_LIST_ASSETS } from "../../constants/roomListAssets.js"
import {
  ROOM_LIST_ACTION_BTN_CLASS,
  ROOM_LIST_ACTION_FRAME_CLASS,
  ROOM_LIST_ACTION_LABEL_CLASS,
} from "../../constants/roomListLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function RoomListActionButton({ label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={ROOM_LIST_ACTION_BTN_CLASS}
    >
      <PublicAsset
        src={ROOM_LIST_ASSETS.optionButton}
        alt=""
        className={ROOM_LIST_ACTION_FRAME_CLASS}
      />
      <span className={ROOM_LIST_ACTION_LABEL_CLASS}>{label}</span>
    </button>
  )
}
