import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets"
import {
  LOBBY_FRIEND_LIST_BTN_CLASS,
  LOBBY_FRIEND_LIST_BTN_IMG_CLASS,
} from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function FriendListToggleButton({ open, onOpen, ariaLabel = "친구 목록" }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={open}
      onClick={onOpen}
      className={LOBBY_FRIEND_LIST_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.openButton}
        alt=""
        className={LOBBY_FRIEND_LIST_BTN_IMG_CLASS}
      />
    </button>
  )
}
