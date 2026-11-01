// 접고 펴는 친구 폴더 하나 (머리 버튼 + 펼치면 친구 줄)
// ListTab이 일반·오프라인·즐겨찾기 폴더로 그림
import { useId, useState } from "react"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import FriendRow from "./FriendRow.jsx"

// 처음 열림 여부만 받고 이후 열고 닫기는 폴더가 가짐, 폰에선 폴더 안 따로 스크롤을 두지 않음
export default function FriendFolder({ label, friends, defaultOpen = false, onOpenMenu }) {
  const [open, setOpen] = useState(defaultOpen)
  const listId = useId()

  return (
    <section className="relative mt-2.5 shrink-0 overflow-hidden rounded-md border border-white/25 bg-black/65 px-2 py-1 shadow-[0_2px_12px_rgba(0,0,0,0.45)]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex min-h-11 w-full items-center gap-2 border-0 bg-transparent p-0"
      >
        <PublicAsset src={open ? FRIEND_LIST_ASSETS.folderOpen : FRIEND_LIST_ASSETS.folderClosed} alt="" className="size-5 shrink-0 select-none" />
        <span className="font-subheading app-text-scaled [--app-text-size:15px] font-bold text-white">{label}</span>
        <PublicAsset src={open ? FRIEND_LIST_ASSETS.chevronUp : FRIEND_LIST_ASSETS.chevronDown} alt="" className="ml-auto size-3.5 shrink-0 select-none opacity-90" />
      </button>
      {open ? (
        <ul id={listId} className="pb-1.5">
          {friends.map((friend) => (
            <FriendRow key={friend.id} friend={friend} onOpenMenu={onOpenMenu} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
