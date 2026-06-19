/**
 * 친구 목록 폴더.
 *
 * 온라인/오프라인 등 그룹 단위로 친구 목록을 접고 펼치는 컴포넌트입니다.
 */
import { useState } from "react"
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import FriendListRow from "./FriendListRow.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const FOLDER_SECTION_CLASS =
  "relative shrink-0 overflow-hidden rounded-md border border-white/25 px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.45)] backdrop-blur-sm"

const FOLDER_HEADER_CLASS =
  "mt-0 [&_img]:opacity-100 [&_span]:font-bold [&_span]:text-white"

function FolderSection({ children, className = "" }) {
  return (
    <section className={`${FOLDER_SECTION_CLASS} ${className}`}>
      <div
        className="pointer-events-none absolute inset-0 bg-black/65"
        aria-hidden="true"
      />
      <div className="relative z-10">{children}</div>
    </section>
  )
}

function FolderHeader({ label, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 ${FOLDER_HEADER_CLASS}`}
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={open ? FRIEND_LIST_ASSETS.folderOpen : FRIEND_LIST_ASSETS.folderClosed}
        alt=""
        className="h-4 w-4 shrink-0 select-none"
      />
      <span className="font-subheading text-[13px] text-white/90">{label}</span>
      <PublicAsset
        src={open ? FRIEND_LIST_ASSETS.chevronUp : FRIEND_LIST_ASSETS.chevronDown}
        alt=""
        className="ml-auto h-3 w-3 shrink-0 select-none opacity-90"
      />
    </button>
  )
}

export default function FriendListFolder({
  label,
  friends,
  defaultOpen = false,
  className = "",
  listClassName = "mt-1.5 pr-0.5",
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <FolderSection className={className}>
      <FolderHeader
        label={label}
        open={open}
        onToggle={() => setOpen((prev) => !prev)}
      />

      {open ? (
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
      ) : null}
    </FolderSection>
  )
}
