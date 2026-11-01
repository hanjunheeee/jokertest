// 친구 목록 여는 그림 버튼
// 로비 친구 영역·대기실(GameMatchingPage 친구 초대)이 씀
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets"
import {
  FRIEND_LIST_BTN_CLASS,
  FRIEND_LIST_BTN_IMG_CLASS,
} from "@/shared/constants/lobbyLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 그림만 있는 버튼이라 접근성 이름을 받음 (대기실은 친구 초대로 바꿔 씀)
export default function FriendListToggleButton({ open, onOpen, ariaLabel = "친구 목록" }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-expanded={open}
      onClick={onOpen}
      className={FRIEND_LIST_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.openButton}
        alt=""
        className={FRIEND_LIST_BTN_IMG_CLASS}
      />
    </button>
  )
}
