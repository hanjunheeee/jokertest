import { FRIEND_LIST_ASSETS } from "../../constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export default function FriendListToggleButton({ open, onOpen }) {
  return (
    <button
      type="button"
      aria-label="친구 목록"
      aria-expanded={open}
      onClick={onOpen}
      className="absolute bottom-[2.5%] right-[2.5%] block w-[clamp(5.25rem,8.5vw,7.25rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 sm:bottom-[3%] sm:right-[3%]"
    >
      <PublicAsset
        src={FRIEND_LIST_ASSETS.openButton}
        alt=""
        className="block h-auto w-full select-none"
      />
    </button>
  )
}
