/**
 * 친구 신청 탭.
 *
 * 검색 상태 및 API 핸들러는 useFriendSearch에 위임합니다.
 * 이 컴포넌트는 결과 표시 및 검색바·행 컴포넌트를 조합하는 역할만 합니다.
 */
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import { useFriendSearch } from "@/domains/lobby/hooks/useFriendSearch.js"
import FriendListSearchBar from "../common/FriendListSearchBar.jsx"
import RecommendedFriendRow from "./RecommendedFriendRow.jsx"
import BackButton from "@/shared/ui/BackButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function FriendRequestTab({ onBack }) {
  const {
    query,
    setQuery,
    results,
    searching,   // 검색 요청 진행 중 — "검색 중..." 표시 제어
    sentIds,     // 신청 완료된 id Set — 버튼 상태 제어
    errorMsg,    // 검색 실패 메시지 — 에러 표시 제어
    handleSearch,
    handleSend,
  } = useFriendSearch()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <FriendListSearchBar
        placeholder="닉네임 입력 후 Enter..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onSubmit={handleSearch} // Enter 키 또는 검색 버튼 → handleSearch 호출
      />

      <div className="relative mt-3 flex w-full shrink-0 items-center justify-center">
        <div className="relative w-[clamp(5.75rem,42%,7rem)]">
          <PublicAsset
            src={FRIEND_LIST_ASSETS.recommendedTag}
            alt=""
            className="block h-auto w-full select-none"
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.65rem,0.95vw,0.78rem)] font-bold tracking-wide text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
            검색 결과
          </span>
        </div>
        <button
          type="button"
          onClick={handleSearch} // 새로고침 버튼 → 동일한 쿼리로 재검색
          aria-label="검색"
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

      {/* searching / errorMsg / results 우선순위 순으로 표시 */}
      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {searching ? (
          <li className="mt-10 text-center text-[11px] text-white/50">검색 중...</li>
        ) : errorMsg ? (
          <li className="mt-10 text-center text-[11px] text-red-400/80">{errorMsg}</li>
        ) : results.length === 0 ? (
          <li className="mt-10 text-center text-[11px] text-white/50">
            닉네임을 검색해 친구를 찾아보세요.
          </li>
        ) : (
          results.map((user) => (
            <RecommendedFriendRow
              key={user.id}
              id={user.id}
              name={user.name}
              profileSrc={user.profile}
              online={user.online}
              onSend={handleSend}
              sent={sentIds.has(user.id)} // sentIds에 포함되면 "신청 완료" 상태로 표시
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
