// 받은 친구 신청 전부 수락 버튼
// FriendAcceptToolbar가 그림
import { FRIEND_ACCEPT_ALL_BUTTON_CLASS, FRIEND_ACCEPT_ALL_LABEL_CLASS, FRIEND_ACCEPT_BUTTON_IMAGE_CLASS } from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 처리 중엔 눌러도 다시 시작하지 않음
export default function AcceptAllButton({ onClick, running }) {
  return (
    <button
      type="button"
      onClick={() => { if (!running) onClick?.() }}
      className={FRIEND_ACCEPT_ALL_BUTTON_CLASS}
      aria-label={running ? "전부 수락 처리 중" : "전부 수락"}
      aria-disabled={running}
      disabled={running}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.acceptAllButton}
        alt=""
        className={FRIEND_ACCEPT_BUTTON_IMAGE_CLASS}
      />
      <span className={FRIEND_ACCEPT_ALL_LABEL_CLASS}>{running ? "처리 중…" : "전부 수락"}</span>
    </button>
  )
}
