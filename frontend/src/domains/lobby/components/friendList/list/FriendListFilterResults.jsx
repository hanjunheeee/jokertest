import { FILTER_MSGS } from "@/domains/lobby/constants/friendListFilter.js"
import {
  FILTER_EMPTY_CLASS,
  FILTER_RESULT_LIST_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import FriendListRow from "@/domains/lobby/components/friendList/list/FriendListRow.jsx"

export default function FriendListFilterResults({ friends, invite = null, block = null }) {
  if (friends.length === 0) {
    return (
      <p className={FILTER_EMPTY_CLASS}>
        {FILTER_MSGS.noResults}
      </p>
    )
  }

  return (
    <ul className={FILTER_RESULT_LIST_CLASS} aria-label="친구 검색 결과">
      {friends.map((friend) => (
        <FriendListRow
          key={friend.id}
          id={friend.id}
          name={friend.name}
          online={friend.online || friend.status === "ONLINE"}
          accountProfilePhotoId={friend.accountProfilePhotoId}
          accountProfileBorderId={friend.accountProfileBorderId}
          onInvite={invite?.onInvite ?? null}
          inviteDisabled={invite?.disabled ?? false}
          inviteDisabledReason={invite?.disabledReason}
          onBlock={block?.onBlock ?? null}
          blocking={block?.blockingIds?.has(friend.id) ?? false}
        />
      ))}
    </ul>
  )
}
