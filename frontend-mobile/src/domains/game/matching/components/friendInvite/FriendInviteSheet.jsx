// 친구 초대 시트: 친구 줄 목록, 친구 없으면 안내 문구
// GameMatchingPage가 씀, 목록·초대 중 표시는 데스크톱 useMatchingFriendInvite 그대로 (지금은 가짜 목록)
import { MODAL_COPY } from "@/domains/game/matching/constants/friendInviteModalCopy.js"
import BottomSheet from "../sheet/BottomSheet.jsx"
import FriendInviteRow from "./FriendInviteRow.jsx"
import { SHEET_NOTE_CLASS } from "../../constants/matchingMobileStyles.js"

// 친구 초대 시트
export default function FriendInviteSheet({ open, onClose, friends = [], invitingIds = new Set(), onInviteFriend }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={MODAL_COPY.title} closeLabel={MODAL_COPY.closeAriaLabel}>
      {friends.length === 0 ? (
        <p role="status" className={`${SHEET_NOTE_CLASS} py-6 text-center text-[#e6dcc8]`}>
          {MODAL_COPY.emptyFriends}
        </p>
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
    </BottomSheet>
  )
}
