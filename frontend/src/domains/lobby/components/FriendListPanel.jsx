import { AnimatePresence, motion } from "framer-motion"
import { useState } from "react"
import {
  countOnlineFriends,
  DUMMY_OFFLINE_FRIENDS,
  DUMMY_ONLINE_FRIENDS,
  FRIEND_LIST_ASSETS,
} from "@/assets/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const PANEL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

/**
 * prototype 대기실 UI5-친구탭 펼침.png
 * 우측 상단 정렬, 하단은 친구목록 버튼(bottom ~2.5%, 높이 ~7rem) 위까지
 */
const PANEL_CLASS =
  "absolute right-0 top-[2.5%] bottom-[clamp(7.5rem,13vh,10.5rem)] z-30 w-[clamp(17.5rem,22.5vw,25.5rem)] max-w-[26rem] sm:bottom-[clamp(8rem,14vh,11rem)]"

/** 친구목록 탭 프레임.png 내부 안전 영역 (상단 장식·하단 테두리 여백) */
const PANEL_INSET = {
  paddingTop: "clamp(4rem, 17%, 5.3rem)",
  paddingBottom: "clamp(2.75rem, 11%, 3.5rem)",
  paddingLeft: "10.5%",
  paddingRight: "10.5%",
}

const FOLDER_SECTION_CLASS =
  "relative shrink-0 overflow-hidden rounded-md border border-white/25 px-2 py-1.5 shadow-[0_2px_12px_rgba(0,0,0,0.45)] backdrop-blur-sm"

function SearchBar() {
  return (
    <div className="relative -mt-1.5 w-full shrink-0">
      <PublicAsset
        src={FRIEND_LIST_ASSETS.searchInput}
        alt=""
        className="block h-auto w-full select-none"
      />
      <input
        type="search"
        placeholder="검색할 친구의 닉네임을 입력하세요."
        className="absolute inset-0 bg-transparent pl-[17%] pr-[6%] text-[11px] text-white/55 outline-none placeholder:text-white/45"
      />
    </div>
  )
}

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

/**
 * 로비 친구 목록 탭 (prototype: 친구목록 창.png, 위치: 대기실 UI5-친구탭 펼침.png)
 */
export default function FriendListPanel({ open, onClose }) {
  const [generalOpen, setGeneralOpen] = useState(true)
  const [offlineOpen, setOfflineOpen] = useState(false)

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="친구 목록 닫기"
            className="absolute inset-0 z-20 cursor-default border-0 bg-black/25 p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PANEL_TRANSITION}
            onClick={onClose}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="친구 목록"
            className={PANEL_CLASS}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={PANEL_TRANSITION}
            onClick={(event) => event.stopPropagation()}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.panelFrame}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
            />

            <div
              className="relative flex h-full min-h-0 flex-col"
              style={PANEL_INSET}
            >
              <SearchBar />

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
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
