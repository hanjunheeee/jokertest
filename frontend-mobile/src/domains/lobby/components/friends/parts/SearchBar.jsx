// 친구 시트 검색 줄 (라벨 + 입력칸, onSubmit이 있는 탭만 키보드 검색 키로 서버 검색)
// 친구 목록·친구 추가·요청 수락 탭이 맨 위에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
// 모바일 친구 시트: 검색 영역·입력칸 높이 축소 (데스크톱 friendListStyle과 분리)
const SEARCH_ZONE_CLASS =
  "mb-2 shrink-0 rounded-md border border-white/20 bg-black/40 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_10px_rgba(0,0,0,0.35)]"

const SEARCH_LABEL_CLASS =
  "mb-0.5 font-subheading app-text-scaled [--app-text-size:12px] font-bold leading-tight tracking-wide text-[#ebe2cc]"

// 데스크톱처럼 검색 버튼 없이 엔터(폰 키보드 '검색' 키)로 보냄
export default function SearchBar({ label, placeholder, value, onChange, onSubmit = null }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <form role="search" aria-label={label} onSubmit={handleSubmit} className={`${SEARCH_ZONE_CLASS} land:mb-1.5 land:py-0.5`}>
      <p className={`${SEARCH_LABEL_CLASS} land:hidden`}>{label}</p>
      <div className="relative h-7 w-full">
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
          className="absolute inset-0 w-full bg-transparent pl-6 pr-1 font-subheading app-text-scaled [--app-text-size:12px] leading-none text-white/85 outline-none placeholder:text-white/65"
        />
      </div>
    </form>
  )
}
