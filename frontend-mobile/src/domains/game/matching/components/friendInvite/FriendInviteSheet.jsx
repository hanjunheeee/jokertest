// 친구 초대 창: 투표 창 틀 + 친구 줄 목록, 친구 없으면 안내 문구, 실패하면 실패 글
// GameMatchingPage가 씀, 목록·초대 중 표시는 데스크톱 useMatchingFriendInvite 그대로 (데스크톱 FriendInviteModal과 같은 틀·글)
import { MODAL_COPY } from "@/domains/game/matching/constants/friendInviteModalCopy.js"
import VoteFrameModal from "@m/shared/ui/modal/VoteFrameModal.jsx"
import { ERROR_CLASS } from "../../constants/voteFrameStyle.js"
import FriendInviteRow from "./FriendInviteRow.jsx"

// 친구 없음 글 (데스크톱 EMPTY_CLASS 색)
const EMPTY_CLASS =
  "mb-2 shrink-0 text-center font-subheading app-text-scaled [--app-text-size:0.8rem] font-bold text-white/70"

// 실패 글: 같은 틀 쓰는 추방 창 오류 글 색 (어두운 틀 위에서 읽힘)
const FAIL_CLASS = `mb-2 shrink-0 text-center ${ERROR_CLASS}`

// 친구 초대 창 (errorMessage = 목록 받기·초대 보내기 실패 글, 데스크톱 FriendInviteModalContent와 같음)
export default function FriendInviteSheet({ open, onClose, friends = [], invitingIds = new Set(), onInviteFriend, errorMessage = null }) {
  return (
    <VoteFrameModal open={open} onClose={onClose} title={MODAL_COPY.title} closeLabel={MODAL_COPY.closeAriaLabel}>
      {friends.length === 0 ? (
        <p role="status" className={EMPTY_CLASS}>{MODAL_COPY.emptyFriends}</p>
      ) : null}
      {/* 목록 받기·초대 보내기 실패 글 (예: 방이 가득 참) */}
      {errorMessage ? (
        <p role="alert" className={FAIL_CLASS}>{errorMessage}</p>
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
