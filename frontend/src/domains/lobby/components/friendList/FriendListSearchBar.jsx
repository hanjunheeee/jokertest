import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import {
  FRIEND_SEARCH_INPUT_CLASS,
  FRIEND_SEARCH_INPUT_FRAME_CLASS,
  FRIEND_SEARCH_LABEL_CLASS,
  FRIEND_SEARCH_ZONE_CLASS,
} from "@/domains/lobby/constants/friendListStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

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
