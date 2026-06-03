import { useState } from "react"
import {
  countOnlineFriends,
  DUMMY_FAVORITE_FRIENDS,
  DUMMY_OFFLINE_FRIENDS,
  DUMMY_ONLINE_FRIENDS,
  FRIEND_LIST_ASSETS,
} from "../constants/friendListAssets.js"
import FriendListSearchBar from "@/domains/lobby/components/FriendListSearchBar.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const FOLDER_SECTION_CLASS =
  "relative shrink-0 overflow-hidden rounded-md border border-white/25 px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.45)] backdrop-blur-sm"

function FolderSection({ children, className = "", plate = false }) {
  return (
    <section className={`${FOLDER_SECTION_CLASS} ${className}`}>
      {plate ? (
        <PublicAsset
          src={FRIEND_LIST_ASSETS.sectionPlate}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
        />
      ) : (
        <div
          className="pointer-events-none absolute inset-0 bg-black/65"
          aria-hidden="true"
        />
      )}
      <div className="relative z-10">{children}</div>
    </section>
  )
}

function FolderHeader({ label, open, onToggle, className = "" }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent p-0 ${className}`}
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

function FriendRow({ name, profileSrc, online }) {
  return (
    <li className="relative mt-2 w-full list-none">
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className="block h-auto w-full select-none"
      />
      <div className="absolute inset-0 flex items-center gap-2 px-[7%] py-[6%]">
        <PublicAsset
          src={profileSrc}
          alt=""
          className="h-auto w-[clamp(2.35rem,26%,3.1rem)] shrink-0 select-none"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-subheading text-[clamp(0.8rem,1.05vw,0.95rem)] leading-tight text-white">
            {name}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="relative inline-flex h-[1.15rem] w-[1.15rem] shrink-0">
              <PublicAsset
                src={FRIEND_LIST_ASSETS.onlineBadge}
                alt=""
                className="h-full w-full select-none"
              />
              {!online ? (
                <span
                  className="pointer-events-none absolute inset-0 rounded-full bg-black/80"
                  aria-hidden="true"
                />
              ) : null}
            </span>
            <span
              className={`text-[10px] leading-none ${
                online ? "text-amber-100/85" : "text-white/35"
              }`}
            >
              {online ? "접속 중" : "오프라인"}
            </span>
          </div>
        </div>
      </div>
    </li>
  )
}

/** prototype 친구목록 창 — 폴더 목록 탭 본문 */
export default function FriendListTabContent() {
  const [generalOpen, setGeneralOpen] = useState(true)
  const [offlineOpen, setOfflineOpen] = useState(false)
  const [favoritesOpen, setFavoritesOpen] = useState(false)

  return (
    <>
      <FriendListSearchBar />

      <FolderSection className="mt-4">
        <FolderHeader
          label={`일반 (${countOnlineFriends(DUMMY_ONLINE_FRIENDS)}/${DUMMY_ONLINE_FRIENDS.length})`}
          open={generalOpen}
          onToggle={() => setGeneralOpen((v) => !v)}
          className="mt-0 [&_img]:opacity-100 [&_span]:font-bold [&_span]:text-white"
        />

        {generalOpen ? (
          <ul className="mt-1.5 pr-0.5">
            {DUMMY_ONLINE_FRIENDS.map((friend) => (
              <FriendRow
                key={friend.id}
                name={friend.name}
                profileSrc={friend.profile}
                online={friend.online}
              />
            ))}
          </ul>
        ) : null}
      </FolderSection>

      <FolderSection className="mt-3.5">
        <FolderHeader
          label={`오프라인 (${DUMMY_OFFLINE_FRIENDS.length})`}
          open={offlineOpen}
          onToggle={() => setOfflineOpen((v) => !v)}
          className="mt-0 [&_img]:opacity-100 [&_span]:font-bold [&_span]:text-white"
        />

        {offlineOpen ? (
          <ul className="mt-1 max-h-[12rem] overflow-y-auto pr-0.5">
            {DUMMY_OFFLINE_FRIENDS.map((friend) => (
              <FriendRow
                key={friend.id}
                name={friend.name}
                profileSrc={friend.profile}
                online={friend.online}
              />
            ))}
          </ul>
        ) : null}
      </FolderSection>

      <FolderSection className="mt-3.5">
        <FolderHeader
          label={`즐겨찾기 (${countOnlineFriends(DUMMY_FAVORITE_FRIENDS)}/${DUMMY_FAVORITE_FRIENDS.length})`}
          open={favoritesOpen}
          onToggle={() => setFavoritesOpen((v) => !v)}
          className="mt-0 [&_img]:opacity-100 [&_span]:font-bold [&_span]:text-white"
        />

        {favoritesOpen ? (
          <ul className="mt-1 max-h-[12rem] overflow-y-auto pr-0.5">
            {DUMMY_FAVORITE_FRIENDS.map((friend) => (
              <FriendRow
                key={friend.id}
                name={friend.name}
                profileSrc={friend.profile}
                online={friend.online}
              />
            ))}
          </ul>
        ) : null}
      </FolderSection>
    </>
  )
}
