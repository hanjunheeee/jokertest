import {
  LOBBY_LEFT_CONTROLS_CLASS,
  LOBBY_RIGHT_CONTROLS_CLASS,
} from "@/shared/constants/lobbyLayoutStyle.js"
import FriendListPanel from "@/domains/lobby/components/friendList/FriendListPanel.jsx"
import FriendListToggleButton from "@/domains/lobby/components/friendList/FriendListToggleButton.jsx"
import NotificationEntryButton from "@/domains/notifications/components/NotificationEntryButton.js"
import NotificationModal from "@/domains/notifications/components/NotificationModal.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"

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
      <div className={LOBBY_LEFT_CONTROLS_CLASS}>
        <NotificationEntryButton open={notificationsOpen} onOpen={onOpenNotifications} />
      </div>

      <div className={LOBBY_RIGHT_CONTROLS_CLASS}>
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
