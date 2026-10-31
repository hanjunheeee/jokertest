import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { FRIEND_VIEW_TAB_LIST_CLASS } from "@/domains/lobby/constants/friendListStyle.js"
import {
  FRIEND_VIEW_TAB_BUTTON_CLASS,
  FRIEND_VIEW_TAB_IMAGE_CLASS,
  FRIEND_VIEW_TAB_LABEL_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

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

export default function FriendListViewTabs({
  activeView, onRequestClick, onAcceptClick, onInviteClick, onBlockClick, inviteCount = 0,
}) {
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
      <FriendListTabButton
        label={inviteCount > 0 ? `게임 초대 ${inviteCount}` : "게임 초대"}
        active={activeView === "invite"}
        onClick={onInviteClick}
      />
      <FriendListTabButton
        label="차단 목록"
        active={activeView === "block"}
        onClick={onBlockClick}
      />
    </div>
  )
}
