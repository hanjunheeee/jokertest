// 파일 역할: FriendListToggleButton.jsx - 화면을 구성하는 컴포넌트입니다.
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets"
import PublicAsset from "@/shared/ui/PublicAsset"

// 로비 우측 하단에 있는 친구 목록 열기 버튼입니다.
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
