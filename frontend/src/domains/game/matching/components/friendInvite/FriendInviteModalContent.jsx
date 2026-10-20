/**
 * 친구 초대 팝업 본문 — 스크롤 친구 목록
 */
import { useRef } from "react"
import { FRIEND_INVITE_MODAL_COPY } from "../../constants/friendInviteModalCopy.js"
import {
  FRIEND_INVITE_EMPTY_CLASS,
  FRIEND_INVITE_MODAL_SCROLL_CLASS,
  FRIEND_INVITE_MODAL_SCROLL_WRAP_CLASS,
} from "../../constants/friendInviteModalLayout.js"
import FriendInviteRow from "./FriendInviteRow.jsx"
import Scrollbar from "@/shared/ui/Scrollbar.jsx"

export default function FriendInviteModalContent({
  friends = [],
  invitingIds = new Set(),
  onInviteFriend,
}) {
  const scrollRef = useRef(null)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {friends.length === 0 ? (
        <p role="status" className={FRIEND_INVITE_EMPTY_CLASS}>
          {FRIEND_INVITE_MODAL_COPY.emptyFriends}
        </p>
      ) : null}

      <div className={FRIEND_INVITE_MODAL_SCROLL_WRAP_CLASS}>
        <ul
          ref={scrollRef}
          className={FRIEND_INVITE_MODAL_SCROLL_CLASS}
          aria-label={FRIEND_INVITE_MODAL_COPY.listAriaLabel}
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
