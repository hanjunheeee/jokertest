// 친구 시트 검색 줄 (라벨 + 입력칸, onSubmit이 있으면 검색 버튼·키보드 검색으로 서버 검색)
// 친구 목록·친구 추가·요청 수락 탭이 맨 위에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { TEXT_BUTTON_CLASS } from "../sheetStyle.js"

// form으로 감싸 폰 키보드 '검색' 키도 같은 처리로 보냄
export default function SearchBar({ label, placeholder, value, onChange, onSubmit = null }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <form
      role="search"
      aria-label={label}
      onSubmit={handleSubmit}
      className="shrink-0 rounded-md border border-white/20 bg-black/45 px-2.5 py-2 land:py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
    >
      <p className="mb-1.5 land:hidden font-subheading app-text-scaled [--app-text-size:14px] font-bold tracking-wide text-[#ebe2cc]">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <div className="relative h-11 min-w-0 flex-1">
          <PublicAsset
            src={FRIEND_LIST_ASSETS.searchInput}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
          />
          <input
            type="search"
            enterKeyHint="search"
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            aria-label={label}
            className="absolute inset-0 w-full bg-transparent pl-9 pr-2 font-subheading text-white/90 outline-none placeholder:text-white/60"
          />
        </div>
        {onSubmit !== null ? (
          <button type="submit" className={`shrink-0 ${TEXT_BUTTON_CLASS}`}>검색</button>
        ) : null}
      </div>
    </form>
  )
}
