// 친구 시트 검색 줄 (라벨 + 입력칸, onSubmit이 있는 탭만 키보드 검색 키로 서버 검색)
// 친구 목록·친구 추가·요청 수락 탭이 맨 위에 그림
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import { SEARCH_LABEL_CLASS, SEARCH_ZONE_CLASS } from "@/domains/lobby/constants/friendListStyle.js"

// 데스크톱처럼 검색 버튼 없이 엔터(폰 키보드 '검색' 키)로 보냄, form이라 키보드 검색 키도 같은 처리
// 입력칸은 누르는 높이 44px·글자 16px (작으면 iOS가 확대함), 폰 가로는 라벨을 숨겨 높이 아낌
export default function SearchBar({ label, placeholder, value, onChange, onSubmit = null }) {
  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <form role="search" aria-label={label} onSubmit={handleSubmit} className={`${SEARCH_ZONE_CLASS} land:py-1`}>
      <p className={`${SEARCH_LABEL_CLASS} land:hidden`}>{label}</p>
      <div className="relative h-11 w-full">
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
          className="absolute inset-0 w-full bg-transparent pl-9 pr-2 font-subheading text-white/85 outline-none placeholder:text-white/65"
        />
      </div>
    </form>
  )
}
