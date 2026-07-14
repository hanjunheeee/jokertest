import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { FRIEND_VIEW_TAB_LIST_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import {
  FRIEND_VIEW_TAB_BUTTON_CLASS,
  FRIEND_VIEW_TAB_IMAGE_CLASS,
  FRIEND_VIEW_TAB_LABEL_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 친구 목록에서 "친구 추가", "요청 수락" 같은 탭 하나를 그리는 버튼입니다.
function FriendListTabButton({ label, active, onClick }) {
  const buttonImage = active
    ? FRIEND_LIST_ASSETS.tabButtonActive
    : FRIEND_LIST_ASSETS.tabButtonInactive

  const labelColorClass = active ? "text-[#e8f0dc]" : "text-[#ebe2cc]/90"

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={FRIEND_VIEW_TAB_BUTTON_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={buttonImage} alt="" className={FRIEND_VIEW_TAB_IMAGE_CLASS} />
      <span className={`${FRIEND_VIEW_TAB_LABEL_CLASS} ${labelColorClass}`} aria-hidden="true">
        {label}
      </span>
    </button>
  )
}

// 친구 목록 패널에서 "친구 추가" 화면과 "요청 수락" 화면을 바꾸는 탭 목록입니다.
export default function FriendListViewTabs({ activeView, onRequestClick, onAcceptClick }) {
  return (
    <div className={FRIEND_VIEW_TAB_LIST_CLASS} role="tablist" aria-label="친구 목록 탭">
      <FriendListTabButton
        label="친구 추가"
        active={activeView === "request"}
        onClick={onRequestClick}
      />
      <FriendListTabButton
        label="요청 수락"
        active={activeView === "accept"}
        onClick={onAcceptClick}
      />
    </div>
  )
}
