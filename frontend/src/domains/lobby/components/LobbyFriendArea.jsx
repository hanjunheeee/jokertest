import { LOBBY_RIGHT_CONTROLS_CLASS } from "@/domains/lobby/constants/lobbyLayoutStyle.js"
import FriendListPanel from "@/domains/lobby/components/friendList/FriendListPanel.jsx"
import FriendListToggleButton from "@/domains/lobby/components/friendList/FriendListToggleButton.jsx"
import SoundControl from "@/shared/ui/SoundControl.jsx"

// 로비 오른쪽 아래 친구창 버튼, 사운드 컨트롤, 친구 패널을 담당합니다.
// 친구 데이터/핸들러는 FriendListPanel이 open 여부를 기준으로 직접 구독하므로
// 여기서는 그대로 통과시키지 않습니다.
export default function LobbyFriendArea({
  audioRef,
  friendListOpen,
  onOpenFriendList,
  onCloseFriendList,
}) {
  return (
    <>
      <div className={LOBBY_RIGHT_CONTROLS_CLASS}>
        <FriendListToggleButton open={friendListOpen} onOpen={onOpenFriendList} />
        <SoundControl audioRef={audioRef} />
      </div>

      <FriendListPanel open={friendListOpen} onClose={onCloseFriendList} />
    </>
  )
}
