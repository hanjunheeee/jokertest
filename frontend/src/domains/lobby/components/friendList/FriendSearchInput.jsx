// 친구 검색 입력칸 (틀 그림 + input)
// FriendListSearchBar가 라벨 아래에 그림
import { FRIEND_LIST_ASSETS } from "../../constants/friendListAssets.js"
import {
  SEARCH_INPUT_CLASS,
  SEARCH_INPUT_FRAME_CLASS,
} from "../../constants/friendListStyle.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 틀 그림은 화면 읽기에서 숨기고 input에 라벨을 붙임
export default function FriendSearchInput({ label, placeholder, value, onChange, onKeyDown }) {
  return (
    <div className="relative w-full">
      <PublicAsset
        src={FRIEND_LIST_ASSETS.searchInput}
        alt=""
        className={SEARCH_INPUT_FRAME_CLASS}
        aria-hidden="true"
      />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        aria-label={label}
        className={SEARCH_INPUT_CLASS}
      />
    </div>
  )
}
