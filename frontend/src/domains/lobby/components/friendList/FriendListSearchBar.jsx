// 친구 목록 탭들의 검색 줄 (라벨 + 입력칸, 엔터로 검색)
// 친구 목록·받은 신청·친구 추가 탭이 씀
import {
  FRIEND_SEARCH_LABEL_CLASS,
  FRIEND_SEARCH_ZONE_CLASS,
} from "../../constants/friendListStyle.js"
import FriendSearchInput from "./FriendSearchInput.jsx"

// onSubmit이 있는 탭만 엔터로 서버 검색을 함
export default function FriendListSearchBar({
  label = "친구 검색",
  placeholder = "검색할 친구 닉네임 입력",
  className = "",
  value,
  onChange,
  onSubmit,
}) {
  const handleKeyDown = (event) => {
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
