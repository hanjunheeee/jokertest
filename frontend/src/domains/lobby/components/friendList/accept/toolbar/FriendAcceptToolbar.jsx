// 받은 친구 신청 탭의 버튼 줄 (전부 수락 + 새로고침)
// FriendAcceptTab이 검색창 아래에 그림
import { FRIEND_ACCEPT_TOOLBAR_CLASS } from "../../../../constants/friendListStyle.js"
import AcceptAllButton from "./AcceptAllButton.jsx"
import FriendAcceptRefreshButton from "./FriendAcceptRefreshButton.jsx"

// 두 버튼을 한 줄로 묶음
export default function FriendAcceptToolbar({ onAcceptAll, onRefresh, acceptAllRunning }) {
  return (
    <div className={FRIEND_ACCEPT_TOOLBAR_CLASS}>
      <AcceptAllButton onClick={onAcceptAll} running={acceptAllRunning} />
      <FriendAcceptRefreshButton onClick={onRefresh} />
    </div>
  )
}
