import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  FRIEND_FOLDER_BACKDROP_CLASS,
  FRIEND_FOLDER_CHEVRON_CLASS,
  FRIEND_FOLDER_CONTENT_CLASS,
  FRIEND_FOLDER_HEADER_CLASS,
  FRIEND_FOLDER_ICON_CLASS,
  FRIEND_FOLDER_LABEL_CLASS,
  FRIEND_FOLDER_LIST_CLASS,
  FRIEND_FOLDER_SECTION_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import { useState } from "react"
import FriendListRow from "@/domains/lobby/components/friendList/list/FriendListRow.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

function FriendListFolderSection({ children, className = "" }) {
  return (
    <section className={`${FRIEND_FOLDER_SECTION_CLASS} ${className}`}>
      <div className={FRIEND_FOLDER_BACKDROP_CLASS} aria-hidden="true" />
      <div className={FRIEND_FOLDER_CONTENT_CLASS}>{children}</div>
    </section>
  )
}

function FriendListFolderHeader({ label, open, onToggle }) {
  const folderIcon = open ? FRIEND_LIST_ASSETS.folderOpen : FRIEND_LIST_ASSETS.folderClosed
  const chevronIcon = open ? FRIEND_LIST_ASSETS.chevronUp : FRIEND_LIST_ASSETS.chevronDown

  return (
    <button
      type="button"
      onClick={onToggle}
      className={FRIEND_FOLDER_HEADER_CLASS}
      style={{ outline: "none" }}
    >
      <PublicAsset src={folderIcon} alt="" className={FRIEND_FOLDER_ICON_CLASS} />
      <span className={FRIEND_FOLDER_LABEL_CLASS}>{label}</span>
      <PublicAsset src={chevronIcon} alt="" className={FRIEND_FOLDER_CHEVRON_CLASS} />
    </button>
  )
}

function FriendListFolderRows({ friends, listClassName = FRIEND_FOLDER_LIST_CLASS, invite, block }) {
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

export default function FriendListFolder({
  label,
  friends,
  defaultOpen = false,
  className = "",
  listClassName,
  invite = null,
  block = null,
}) {
  const [open, setOpen] = useState(defaultOpen)

  const toggleOpen = () => {
    setOpen((prev) => !prev)
  }

  return (
    <FriendListFolderSection className={className}>
      <FriendListFolderHeader label={label} open={open} onToggle={toggleOpen} />
      {open ? (
        <FriendListFolderRows
          friends={friends}
          listClassName={listClassName}
          invite={invite}
          block={block}
        />
      ) : null}
    </FriendListFolderSection>
  )
}
