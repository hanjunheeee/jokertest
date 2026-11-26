// 친구 초대 창: 투표 창 틀 + 거절 사유·친구 줄 목록, 친구 없으면 안내 문구 표시
// GameMatchingPage가 사용, 목록·초대 중·실패 문구는 데스크톱 useMatchingFriendInvite에서 받음
import { MODAL_COPY } from "@/domains/game/matching/constants/friendInviteModalCopy.js"
import VoteFrameModal from "@m/shared/ui/modal/VoteFrameModal.jsx"
import FriendInviteRow from "./FriendInviteRow.jsx"

// 친구 없음 글 모양
const EMPTY_CLASS =
  "mb-2 mt-2 shrink-0 translate-y-1 text-center font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold text-white/70"

// 초대 거절·목록 조회 실패 문구 (어두운 받침 + 밝은 글자로 대비 4.5 이상 보장)
const ERROR_ALERT_CLASS =
  "mb-2 mt-1 shrink-0 rounded-sm border border-[#b50000]/60 bg-[#3a1410]/92 px-2.5 py-1.5 text-center font-subheading app-text-scaled [--app-text-size:0.85rem] font-semibold leading-snug text-[#ffd9d2]"

// 친구 초대 창
export default function FriendInviteSheet({
  open,
  onClose,
  friends = [],
  invitingIds = new Set(),
  onInviteFriend,
  errorMessage = null,
}) {
  return (
    <VoteFrameModal open={open} onClose={onClose} title={MODAL_COPY.title} closeLabel={MODAL_COPY.closeAriaLabel}>
      {friends.length === 0 ? (
        <p role="status" className={EMPTY_CLASS}>{MODAL_COPY.emptyFriends}</p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className={ERROR_ALERT_CLASS}>{errorMessage}</p>
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
