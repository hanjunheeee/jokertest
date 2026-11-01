// 친구 줄 맨 앞 즐겨찾기 별 버튼
// FriendRow가 줄 맨 앞에 그림
import {
  ROW_FAVORITE_STAR_ACTIVE_CLASS,
  ROW_FAVORITE_STAR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"

// 별 모양·색은 데스크톱 FriendListFavoriteStar 그대로, 누르는 칸만 44px (음수 여백으로 줄 안 자리는 그대로)
export default function FavoriteStar({ active, onToggle }) {
  return (
    <button
      type="button"
      aria-label={active ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={active}
      onClick={onToggle}
      className="relative z-[2] -mx-3 grid size-11 shrink-0 cursor-pointer place-items-center border-0 bg-transparent p-0 leading-none transition-opacity active:opacity-90"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={active ? ROW_FAVORITE_STAR_ACTIVE_CLASS : ROW_FAVORITE_STAR_CLASS}
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      >
        <path d="M12 3.2 14.8 9l6.2.5-4.7 4 1.4 6.1L12 16.8 6.3 19.6 7.7 13.5 3 9.5l6.2-.5L12 3.2z" />
      </svg>
    </button>
  )
}
