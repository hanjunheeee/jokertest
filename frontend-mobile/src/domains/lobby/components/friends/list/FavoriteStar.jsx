// 친구 줄 맨 앞 즐겨찾기 별 버튼 (누르는 칸 44px)
// FriendRow가 줄 앞 칸에 그림
// 눌림 상태를 aria-pressed로 알리고, 저장 중엔 잠금
export default function FavoriteStar({ active, saving, onToggle }) {
  return (
    <button
      type="button"
      aria-label={active ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={active}
      aria-disabled={saving}
      disabled={saving}
      onClick={onToggle}
      className="relative grid size-11 shrink-0 place-items-center border-0 bg-transparent p-0 active:scale-95 disabled:opacity-50"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`block size-6 select-none ${active ? "text-[#e8c56a]" : "text-[#a89262]/60"}`}
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
