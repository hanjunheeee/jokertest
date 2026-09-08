import {
  FRIEND_ROW_FAVORITE_BUTTON_CLASS,
  FRIEND_ROW_FAVORITE_STAR_ACTIVE_CLASS,
  FRIEND_ROW_FAVORITE_STAR_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"

/** 기본 탭 친구 row — 즐겨찾기 별 토글 (프론트 store만) */
export default function FriendListFavoriteStar({ active = false, onToggle }) {
  const starClass = active
    ? FRIEND_ROW_FAVORITE_STAR_ACTIVE_CLASS
    : FRIEND_ROW_FAVORITE_STAR_CLASS

  return (
    <button
      type="button"
      className={FRIEND_ROW_FAVORITE_BUTTON_CLASS}
      aria-label={active ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={active}
      onClick={(event) => {
        event.stopPropagation()
        onToggle?.()
      }}
      style={{ outline: "none" }}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={starClass}
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
