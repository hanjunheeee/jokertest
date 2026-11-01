// 받은 친구 신청 목록 새로고침 버튼
// FriendAcceptToolbar가 그림
import { ACCEPT_REFRESH_BTN_CLASS, ACCEPT_REFRESH_BTN_IMG_CLASS } from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 이미지 버튼이라 접근성 이름을 붙임
export default function FriendAcceptRefreshButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="친구 신청 목록 새로고침"
      className={ACCEPT_REFRESH_BTN_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.refreshButton}
        alt=""
        className={ACCEPT_REFRESH_BTN_IMG_CLASS}
      />
    </button>
  )
}
