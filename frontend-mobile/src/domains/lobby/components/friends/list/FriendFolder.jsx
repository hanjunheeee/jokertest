// 접고 펴는 친구 폴더 하나 (머리 버튼 + 펼치면 친구 줄)
// ListTab이 일반·오프라인·즐겨찾기 폴더로 그림
import { useState } from "react"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  FOLDER_BACKDROP_CLASS,
  FOLDER_CHEVRON_CLASS,
  FOLDER_CONTENT_CLASS,
  FOLDER_HEADER_CLASS,
  FOLDER_ICON_CLASS,
  FOLDER_LABEL_CLASS,
  FOLDER_LIST_CLASS,
  FOLDER_SECTION_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import FriendRow from "./FriendRow.jsx"

// 모양은 데스크톱 FriendListFolder 그대로, 머리 누르는 칸만 44px
// 폰에선 시트 목록 하나만 스크롤해서 오프라인·즐겨찾기 폴더 안 따로 스크롤(max-h 12rem)은 두지 않음
export default function FriendFolder({ label, friends, defaultOpen = false, className = "", invite, block }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={`${FOLDER_SECTION_CLASS} ${className}`}>
      <div className={FOLDER_BACKDROP_CLASS} aria-hidden="true" />
      <div className={FOLDER_CONTENT_CLASS}>
        <button type="button" onClick={() => setOpen((prev) => !prev)} className={`${FOLDER_HEADER_CLASS} -my-1.5 min-h-11`}>
          <PublicAsset src={open ? FRIEND_LIST_ASSETS.folderOpen : FRIEND_LIST_ASSETS.folderClosed} alt="" className={FOLDER_ICON_CLASS} />
          <span className={FOLDER_LABEL_CLASS}>{label}</span>
          <PublicAsset src={open ? FRIEND_LIST_ASSETS.chevronUp : FRIEND_LIST_ASSETS.chevronDown} alt="" className={FOLDER_CHEVRON_CLASS} />
        </button>
        {open ? (
          <ul className={`${FOLDER_LIST_CLASS} pb-1.5`}>
            {friends.map((friend) => (
              <FriendRow key={friend.id} friend={friend} invite={invite} block={block} />
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
