// 로비 양옆 버튼과 친구 목록 패널·알림 창
// LobbyPage가 씀
import {
  LEFT_CONTROLS_CLASS,
  RIGHT_CONTROLS_CLASS,
} from "@/shared/constants/lobbyLayoutStyle.js"
import FriendListPanel from "@/domains/lobby/components/friendList/FriendListPanel.jsx"
import FriendListToggleButton from "@/domains/lobby/components/friendList/FriendListToggleButton.jsx"
import NotificationEntryButton from "@/domains/notifications/components/NotificationEntryButton.js"
import NotificationModal from "@/domains/notifications/components/NotificationModal.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"

// 왼쪽 알림 버튼, 오른쪽 친구 버튼·소리 조절, 그리고 패널·알림 창
export default function LobbyFriendArea({
  friendListOpen,
  onOpenFriendList,
  onCloseFriendList,
  notificationsOpen,
  onOpenNotifications,
  onCloseNotifications,
  onNotificationNavigate,
  friendRequestTargetId,
  gameInviteTargetId = null,
}) {
  return (
    <>
      <div className={LEFT_CONTROLS_CLASS}>
        <NotificationEntryButton open={notificationsOpen} onOpen={onOpenNotifications} />
      </div>

      <div className={RIGHT_CONTROLS_CLASS}>
        <FriendListToggleButton open={friendListOpen} onOpen={onOpenFriendList} />
        <SoundControl />
      </div>

      <FriendListPanel
        open={friendListOpen}
        onClose={onCloseFriendList}
        targetRequestId={friendRequestTargetId}
        targetInviteId={gameInviteTargetId}
      />

      <NotificationModal
        open={notificationsOpen}
        onClose={onCloseNotifications}
        onNavigate={onNotificationNavigate}
      />
    </>
  )
}
