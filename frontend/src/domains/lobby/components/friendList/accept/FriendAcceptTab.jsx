import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import FriendListSearchBar from "../common/FriendListSearchBar.jsx"
import IncomingFriendRow from "./IncomingFriendRow.jsx"
import BackButton from "@/shared/ui/BackButton.jsx"
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

/** * @desc 친구 수락 탭 (실제 API 연동 버전)
 * @param {Function} onBack - 친구 목록으로 돌아가기 핸들러
 * @param {Array} incomingRequests - 백엔드에서 받아온 대기 중인 친구 요청 배열
 * @param {Function} onAcceptAll - 전부 수락 버튼 클릭 핸들러
 * @param {Function} onRefresh - 새로고침 버튼 클릭 핸들러
 */
export default function FriendAcceptTab({
  onBack,
  incomingRequests = [],
  onAccept,
  onDecline,
  onAcceptAll,
  onRefresh
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <FriendListSearchBar placeholder="닉네임 또는 ID 입력..." />

      <div className="relative mt-3 flex w-full shrink-0 items-center justify-end gap-[clamp(0.3rem,0.55vw,0.45rem)] pr-[clamp(0.65rem,3.5%,1rem)]">
        {/* 부모에게서 받은 onAcceptAll 함수를 연결! */}
        <AcceptAllButton onClick={onAcceptAll} />
        <button
          type="button"
          onClick={onRefresh} // 💡 부모에게서 받은 새로고침 함수를 연결!
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
        {/* 받은 요청이 없을 때의 UI 처리 */}
        {incomingRequests.length === 0 ? (
          <li className="mt-10 text-center text-[11px] text-white/50">
            받은 친구 요청이 없습니다.
          </li>
        ) : (
          incomingRequests.map((req) => (
            <IncomingFriendRow
              key={req.request_id || req.id}
              requestId={req.request_id}
              name={req.name}
              profileSrc={req.profile}
              onAccept={onAccept}
              onDecline={onDecline}
            />
          ))
        )}
      </ul>

      <BackButton
        size="compact"
        ariaLabel="친구 목록으로 돌아가기"
        onClick={onBack}
        className="mt-2"
      />
    </div>
  )
}