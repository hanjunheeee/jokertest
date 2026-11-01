// 친구 초대 창 본문: 친구 줄 목록(스크롤), 친구 없으면 안내 문구
// GameMatchingPage가 FriendInviteModalShell 안에 넣어 씀
import { useRef } from "react"
import { MODAL_COPY } from "../../constants/friendInviteModalCopy.js"
import {
  EMPTY_CLASS,
  SCROLL_CLASS,
  SCROLL_WRAP_CLASS,
} from "../../constants/friendInviteModalLayout.js"
import FriendInviteRow from "./FriendInviteRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

// 친구 목록 본문 (초대 중인 친구는 invitingIds로 받음)
export default function FriendInviteModalContent({
  friends = [],
  invitingIds = new Set(),
  onInviteFriend,
}) {
  // 직접 그린 스크롤바가 목록 스크롤 위치를 읽게 ref 같이 넘김
  const scrollRef = useRef(null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 친구 없으면 안내 문구 띄움 */}
      {friends.length === 0 ? (
        <p role="status" className={EMPTY_CLASS}>
          {MODAL_COPY.emptyFriends}
        </p>
      ) : null}

      <div className={SCROLL_WRAP_CLASS}>
        <ul
          ref={scrollRef}
          className={SCROLL_CLASS}
          aria-label={MODAL_COPY.listAriaLabel}
        >
          {friends.map((friend) => (
            <FriendInviteRow
              key={friend.id}
              id={friend.id}
              name={friend.name}
              accountProfilePhotoId={friend.accountProfilePhotoId}
              accountProfileBorderId={friend.accountProfileBorderId}
              accountTotalGames={friend.accountTotalGames}
              accountWinRate={friend.accountWinRate}
              inviting={invitingIds.has(friend.id)}
              onInvite={onInviteFriend}
            />
          ))}
        </ul>
        <Scrollbar scrollRef={scrollRef} />
      </div>
    </div>
  )
}
