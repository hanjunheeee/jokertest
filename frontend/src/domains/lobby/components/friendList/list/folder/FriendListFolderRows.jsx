// 펼친 친구 폴더 안의 친구 줄 목록
// FriendListFolder가 열렸을 때 그림
import { FRIEND_FOLDER_LIST_CLASS } from "../../../../constants/friendListStyle.js"
import FriendListRow from "../FriendListRow.jsx"

// 초대·차단 묶음이 없으면 그 버튼을 안 보임
export default function FriendListFolderRows({ friends, listClassName = FRIEND_FOLDER_LIST_CLASS, invite, block }) {
  return (
    <ul className={listClassName}>
      {friends.map((friend) => (
        <FriendListRow
          key={friend.id}
          id={friend.id}
          name={friend.name}
          online={friend.online}
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
