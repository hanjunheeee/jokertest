import {
  DUMMY_INCOMING_FRIEND_REQUESTS,
  FRIEND_LIST_ASSETS,
} from "../../../constants/friendListAssets.js"
import FriendListSearchBar from "../common/FriendListSearchBar.jsx"
import IncomingFriendRow from "./IncomingFriendRow.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

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
