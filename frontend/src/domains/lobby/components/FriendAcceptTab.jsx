import {
  DUMMY_INCOMING_FRIEND_REQUESTS,
  FRIEND_LIST_ASSETS,
} from "../constants/friendListAssets.js"
import FriendListSearchBar from "@/domains/lobby/components/FriendListSearchBar.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

const ROW_ACTION_BTN_CLASS =
  "block w-[clamp(1.85rem,2.8vw,2.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"

function AcceptAllButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-[clamp(4.75rem,38%,6.1rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"
      aria-label="전부 수락"
      style={{ outline: "none" }}
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.acceptAllButton}
        alt=""
        className="block h-auto w-full select-none"
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.62rem,0.9vw,0.76rem)] font-bold tracking-wide text-[#e8f0dc] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
        전부 수락
      </span>
    </button>
  )
}

function IncomingFriendRow({ name, profileSrc, online }) {
  return (
    <li className="relative mt-2 w-full list-none">
      <PublicAsset
        src={FRIEND_LIST_ASSETS.rowFrame}
        alt=""
        className="block h-auto w-full select-none"
      />
      <div className="absolute inset-0 flex items-center justify-between gap-1 px-[6%] py-[6%]">
        <div className="flex min-w-0 max-w-[58%] items-center gap-2">
          <div className="relative size-[2.65rem] shrink-0">
            <PublicAsset
              src={FRIEND_LIST_ASSETS.profileFrame}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            />
            <div className="absolute inset-[22%] overflow-hidden">
              <PublicAsset
                src={profileSrc}
                alt=""
                className="block h-full w-full select-none object-cover object-center"
              />
            </div>
          </div>

          <div className="min-w-0">
            <p className="truncate font-subheading text-[clamp(0.78rem,1vw,0.92rem)] leading-tight text-white">
              {name}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="relative inline-flex h-[1.05rem] w-[1.05rem] shrink-0">
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
                className={`text-[9px] leading-none ${
                  online ? "text-amber-100/85" : "text-white/35"
                }`}
              >
                {online ? "접속 중" : "오프라인"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-[clamp(0.2rem,0.45vw,0.35rem)]">
          <button
            type="button"
            className={ROW_ACTION_BTN_CLASS}
            aria-label={`${name} 차단`}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendBlockButton}
              alt=""
              className="block h-auto w-full select-none"
            />
          </button>
          <button
            type="button"
            className={ROW_ACTION_BTN_CLASS}
            aria-label={`${name} 친구 수락`}
            style={{ outline: "none" }}
          >
            <PublicAsset
              src={FRIEND_LIST_ASSETS.friendAcceptButton}
              alt=""
              className="block h-auto w-full select-none"
            />
          </button>
        </div>
      </div>
    </li>
  )
}

/** prototype 친구 수락 — 상단 전부수락+새로고침, 행 차단+수락 */
export default function FriendAcceptTab({ onBack }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FriendListSearchBar placeholder="닉네임 또는 ID 입력..." />

      <div className="relative mt-3 flex w-full shrink-0 items-center justify-end gap-[clamp(0.3rem,0.55vw,0.45rem)] pr-[clamp(0.65rem,3.5%,1rem)]">
        <AcceptAllButton onClick={() => {}} />
        <button
          type="button"
          aria-label="친구 신청 목록 새로고침"
          className="w-[clamp(1.45rem,2.1vw,1.7rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={FRIEND_LIST_ASSETS.refreshButton}
            alt=""
            className="block h-auto w-full select-none"
          />
        </button>
      </div>

      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {DUMMY_INCOMING_FRIEND_REQUESTS.map((friend) => (
          <IncomingFriendRow
            key={friend.id}
            name={friend.name}
            profileSrc={friend.profile}
            online={friend.online}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={onBack}
        aria-label="친구 목록으로 돌아가기"
        className="mt-2 w-[clamp(2.35rem,4vw,2.85rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={FRIEND_LIST_ASSETS.backButton}
          alt=""
          className="block h-auto w-full select-none"
        />
      </button>
    </div>
  )
}
