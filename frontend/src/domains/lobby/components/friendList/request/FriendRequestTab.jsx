import {
  DUMMY_RECOMMENDED_FRIENDS,
  FRIEND_LIST_ASSETS,
} from "../../../constants/friendListAssets.js"
import FriendListSearchBar from "../common/FriendListSearchBar.jsx"
import RecommendedFriendRow from "./RecommendedFriendRow.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

/** prototype 친구 신청 창2 — 추천 친구 탭 본문 */
export default function FriendRequestTab({ onBack }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FriendListSearchBar placeholder="닉네임 또는 ID 입력..." />

      <div className="relative mt-3 flex w-full shrink-0 items-center justify-center">
        <div className="relative w-[clamp(5.75rem,42%,7rem)]">
          <PublicAsset
            src={FRIEND_LIST_ASSETS.recommendedTag}
            alt=""
            className="block h-auto w-full select-none"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.65rem,0.95vw,0.78rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
            추천 친구
          </span>
        </div>
        <button
          type="button"
          aria-label="추천 친구 새로고침"
          className="absolute top-1/2 right-[clamp(0.65rem,3.5%,1rem)] w-[clamp(1.45rem,2.1vw,1.7rem)] -translate-y-[calc(50%-0.15rem)] cursor-pointer border-0 bg-transparent p-0 transition-opacity hover:opacity-90"
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
        {DUMMY_RECOMMENDED_FRIENDS.map((friend) => (
          <RecommendedFriendRow
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
