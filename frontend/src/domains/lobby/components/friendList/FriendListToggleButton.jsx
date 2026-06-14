import { FRIEND_LIST_ASSETS } from "../../constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function FriendListToggleButton({ open, onOpen }) {
  return (
    <button
      type="button"
      aria-label="친구 목록"
      aria-expanded={open}
      onClick={onOpen}
      className="group block w-[clamp(5.25rem,8.5vw,7.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.openButton}
        alt=""
        className="block h-auto w-full select-none transition-transform duration-200 ease-out group-hover:scale-[1.1] group-active:scale-[0.95]"
      />
    </button>
  )
}
