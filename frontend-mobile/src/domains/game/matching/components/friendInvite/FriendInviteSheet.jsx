// 친구 초대 창: 투표 창 틀 + 친구 줄 목록, 친구 없으면 안내 문구
// GameMatchingPage가 씀, 목록·초대 중 표시는 데스크톱 useMatchingFriendInvite 그대로 (데스크톱 FriendInviteModal과 같은 틀·글)
import { MODAL_COPY } from "@/domains/game/matching/constants/friendInviteModalCopy.js"
import VoteFrameModal from "@m/shared/ui/modal/VoteFrameModal.jsx"
import FriendInviteRow from "./FriendInviteRow.jsx"

// 친구 없음 글 (데스크톱 EMPTY_CLASS 색)
const EMPTY_CLASS =
  "mb-2 shrink-0 text-center font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold text-white/70"

// 친구 초대 창
export default function FriendInviteSheet({ open, onClose, friends = [], invitingIds = new Set(), onInviteFriend }) {
  return (
    <VoteFrameModal open={open} onClose={onClose} title={MODAL_COPY.title} closeLabel={MODAL_COPY.closeAriaLabel}>
      {friends.length === 0 ? (
        <p role="status" className={EMPTY_CLASS}>{MODAL_COPY.emptyFriends}</p>
      ) : null}
      <ul aria-label={MODAL_COPY.listAriaLabel} className="flex flex-col">
        {friends.map((friend) => (
          <FriendInviteRow
            key={friend.id}
            friend={friend}
            inviting={invitingIds.has(friend.id)}
            onInvite={onInviteFriend}
          />
        ))}
      </ul>
    </VoteFrameModal>
  )
}
