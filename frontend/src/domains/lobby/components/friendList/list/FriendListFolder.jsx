// 접고 펴는 친구 폴더 하나 (머리 + 펼치면 친구 줄)
// FriendListGroupFolders가 접속·오프라인·즐겨찾기 폴더로 그림
import { useState } from "react"
import FriendListFolderSection from "./folder/FriendListFolderSection.jsx"
import FriendListFolderHeader from "./folder/FriendListFolderHeader.jsx"
import FriendListFolderRows from "./folder/FriendListFolderRows.jsx"

// 처음 열림 여부만 바깥에서 받고 이후 열고 닫기는 폴더가 가짐
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
