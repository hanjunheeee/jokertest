// 친구 목록 탭 버튼 하나 (켜짐/꺼짐 그림 + 글자)
// FriendListViewTabs가 탭마다 그림
import { FRIEND_LIST_ASSETS } from "../../constants/friendListAssets.js"
import {
  FRIEND_VIEW_TAB_BUTTON_CLASS,
  FRIEND_VIEW_TAB_IMAGE_CLASS,
  FRIEND_VIEW_TAB_LABEL_CLASS,
} from "../../constants/friendListStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 글자는 그림 위에 겹쳐 보이기만 하고 이름은 aria-label로 줌
export default function FriendListTabButton({ label, active, onClick }) {
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
