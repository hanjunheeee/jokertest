// 친구 목록 패널 위쪽 탭 줄 (친구 추가·요청 수락·게임 초대·차단 목록)
// FriendListPanelContent가 맨 위에 그림
import { VIEW_TAB_LIST_CLASS } from "../../constants/friendListStyle.js"
import FriendListTabButton from "./FriendListTabButton.jsx"

// 대기 중인 게임 초대가 있으면 탭 글자에 개수를 붙임
export default function FriendListViewTabs({
  activeView, onRequestClick, onAcceptClick, onInviteClick, onBlockClick, inviteCount = 0,
}) {
  return (
    <div className={VIEW_TAB_LIST_CLASS} role="tablist" aria-label="친구 목록 탭">
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
