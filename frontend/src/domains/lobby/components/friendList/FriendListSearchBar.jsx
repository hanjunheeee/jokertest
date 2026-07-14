import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  FRIEND_SEARCH_INPUT_CLASS,
  FRIEND_SEARCH_INPUT_FRAME_CLASS,
  FRIEND_SEARCH_LABEL_CLASS,
  FRIEND_SEARCH_ZONE_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 프레임 이미지 위에 실제 검색 input을 겹쳐서 보여줍니다.
function FriendSearchInput({ label, placeholder, value, onChange, onKeyDown }) {
  return (
    <div className="relative w-full">
      <PublicAsset
        src={FRIEND_LIST_ASSETS.searchInput}
        alt=""
        className={FRIEND_SEARCH_INPUT_FRAME_CLASS}
        aria-hidden="true"
      />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        aria-label={label}
        className={FRIEND_SEARCH_INPUT_CLASS}
      />
    </div>
  )
}

// 친구 목록 패널에서 친구 검색 제목과 검색 입력창을 보여주는 컴포넌트입니다.
export default function FriendListSearchBar({
  label = "친구 검색",
  placeholder = "검색할 친구 닉네임 입력",
  className = "",
  value,
  onChange,
  onSubmit,
}) {
  const handleKeyDown = (event) => {
    // Enter 키를 누르면 검색을 실행합니다.
    if (event.key === "Enter") onSubmit?.()
  }

  return (
    <section className={`${FRIEND_SEARCH_ZONE_CLASS} ${className}`} aria-label={label}>
      <p className={FRIEND_SEARCH_LABEL_CLASS}>{label}</p>
      <FriendSearchInput
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
      />
    </section>
  )
}
