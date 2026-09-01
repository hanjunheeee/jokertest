// 파일 역할: FriendListToggleButton.jsx - 화면을 구성하는 컴포넌트입니다.
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets"
import {
  LOBBY_FRIEND_LIST_BTN_CLASS,
  LOBBY_FRIEND_LIST_BTN_IMG_CLASS,
} from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 로비 우측 하단에 있는 친구 목록 열기 버튼입니다.
export default function FriendListToggleButton({ open, onOpen }) {
  return (
    <button
      type="button"
      aria-label="친구 목록"
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
