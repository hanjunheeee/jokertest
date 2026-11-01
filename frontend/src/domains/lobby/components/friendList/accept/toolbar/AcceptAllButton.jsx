// 받은 친구 신청 전부 수락 버튼
// FriendAcceptToolbar가 그림
import { ACCEPT_ALL_BTN_CLASS, ACCEPT_ALL_LABEL_CLASS, ACCEPT_BTN_IMG_CLASS } from "../../../../constants/friendListStyle.js"
import { FRIEND_LIST_ASSETS } from "../../../../constants/friendListAssets.js"
import PublicAsset from "../../../../../../shared/ui/PublicAsset.jsx"

// 처리 중엔 눌러도 다시 시작하지 않음
export default function AcceptAllButton({ onClick, running }) {
  return (
    <button
      type="button"
      onClick={() => { if (!running) onClick?.() }}
      className={ACCEPT_ALL_BTN_CLASS}
      aria-label={running ? "전부 수락 처리 중" : "전부 수락"}
      aria-disabled={running}
      disabled={running}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.acceptAllButton}
        alt=""
        className={ACCEPT_BTN_IMG_CLASS}
      />
      <span className={ACCEPT_ALL_LABEL_CLASS}>{running ? "처리 중…" : "전부 수락"}</span>
    </button>
  )
}
