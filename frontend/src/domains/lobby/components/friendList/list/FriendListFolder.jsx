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

// 접고 펼치는 친구 그룹의 바깥 박스입니다.
function FriendListFolderSection({ children, className = "" }) {
  return (
    <section className={`${FRIEND_FOLDER_SECTION_CLASS} ${className}`}>
      <div className={FRIEND_FOLDER_BACKDROP_CLASS} aria-hidden="true" />
      <div className={FRIEND_FOLDER_CONTENT_CLASS}>{children}</div>
    </section>
  )
}

// 친구 그룹을 열고 닫는 헤더 버튼입니다.
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

// 펼쳐진 폴더 안에 친구 row들을 렌더링합니다.
function FriendListFolderRows({ friends, listClassName = FRIEND_FOLDER_LIST_CLASS }) {
  return (
    <ul className={listClassName}>
      {friends.map((friend) => (
        <FriendListRow
          key={friend.id}
          name={friend.name}
          profileSrc={friend.profile}
          online={friend.online}
        />
      ))}
    </ul>
  )
}

// 온라인 친구, 오프라인 친구처럼 접고 펼칠 수 있는 친구 그룹입니다.
export default function FriendListFolder({
  label,
  friends,
  defaultOpen = false,
  className = "",
  listClassName,
}) {
  // 현재 친구 그룹이 펼쳐져 있는지 표시합니다.
  const [open, setOpen] = useState(defaultOpen)

  const toggleOpen = () => {
    setOpen((prev) => !prev)
  }

  return (
    <FriendListFolderSection className={className}>
      <FriendListFolderHeader label={label} open={open} onToggle={toggleOpen} />
      {open ? <FriendListFolderRows friends={friends} listClassName={listClassName} /> : null}
    </FriendListFolderSection>
  )
}
