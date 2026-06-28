/**
 * 친구 목록 검색창.
 *
 * 친구 목록과 친구 신청 탭에서 공통으로 사용하는 검색 입력 UI입니다.
 * 라벨·구역 박스·placeholder 대비로 폴더 목록과 시각적으로 구분합니다.
 */
import { FRIEND_LIST_ASSETS } from "../../../constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const SEARCH_ZONE_CLASS =
  "mb-4 shrink-0 rounded-md border border-white/20 bg-black/40 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_10px_rgba(0,0,0,0.35)]"

const SEARCH_LABEL_CLASS =
  "mb-1.5 font-subheading text-[12px] font-bold tracking-wide text-[#ebe2cc]"

const SEARCH_INPUT_CLASS =
  "absolute inset-0 bg-transparent pl-[17%] pr-[6%] font-subheading text-[12px] text-white/85 outline-none placeholder:text-white/65"

export default function FriendListSearchBar({
  label = "친구 검색",
  placeholder = "검색할 친구 닉네임 입력",
  className = "",
  value,
  onChange,
  onSubmit,
}) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && onSubmit) onSubmit()
  }

  return (
    <section className={`${SEARCH_ZONE_CLASS} ${className}`} aria-label={label}>
      <p className={SEARCH_LABEL_CLASS}>{label}</p>
      <div className="relative w-full">
        <PublicAsset
          src={FRIEND_LIST_ASSETS.searchInput}
          alt=""
          className="block h-auto w-full select-none"
          aria-hidden="true"
        />
        <input
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          aria-label={label}
          className={SEARCH_INPUT_CLASS}
        />
      </div>
    </section>
  )
}
