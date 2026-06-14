import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function FriendListSearchBar({
  placeholder = "검색할 친구의 닉네임을 입력하세요.",
  className = "",
  value,
  onChange,
  onSubmit,
}) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && onSubmit) onSubmit()
  }

  return (
    <div className={`relative -mt-1.5 w-full shrink-0 ${className}`}>
      <PublicAsset
        src={FRIEND_LIST_ASSETS.searchInput}
        alt=""
        className="block h-auto w-full select-none"
      />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={handleKeyDown}
        className="absolute inset-0 bg-transparent pl-[17%] pr-[6%] text-[11px] text-white/55 outline-none placeholder:text-white/45"
      />
    </div>
  )
}
