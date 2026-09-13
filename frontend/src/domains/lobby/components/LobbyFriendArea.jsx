import { LOBBY_RIGHT_CONTROLS_CLASS } from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import FriendListPanel from "@/domains/lobby/components/friendList/FriendListPanel.jsx"
import FriendListToggleButton from "@/domains/lobby/components/friendList/FriendListToggleButton.jsx"
import NotificationEntryButton from "@/domains/notifications/components/NotificationEntryButton.js"
import NotificationModal from "@/domains/notifications/components/NotificationModal.js"
import SoundControl from "@/shared/ui/SoundControl.jsx"

// 로비 오른쪽 아래 알림 버튼, 친구창 버튼, 사운드 컨트롤, 친구 패널을 담당합니다.
// 친구 데이터/핸들러는 FriendListPanel이 open 여부를 기준으로 직접 구독하므로
// 여기서는 그대로 통과시키지 않습니다.
//
// F-17: 알림 진입 버튼과 알림 모달도 같은 우측 제어 영역에 둡니다 — 목록·미확인 수는
// NotificationEntryButton이 store에서 직접 구독하므로 여기서 prop으로 나르지 않습니다.
export default function LobbyFriendArea({
  audioRef,
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
      <div className={LOBBY_RIGHT_CONTROLS_CLASS}>
        <NotificationEntryButton open={notificationsOpen} onOpen={onOpenNotifications} />
        <FriendListToggleButton open={friendListOpen} onOpen={onOpenFriendList} />
        <SoundControl audioRef={audioRef} />
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
