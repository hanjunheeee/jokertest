// 친구 목록 여는 그림 버튼
// BottomBar가 씀
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 FriendListToggleButton과 같은 이름·눌림 (누르는 칸만 44px 이상)
export default function FriendsButton({ open, onOpen }) {
    return (
        <button
            type="button"
            aria-label="친구 목록"
            aria-expanded={open}
            onClick={onOpen}
            className="interactive-scale flex h-12 w-12 shrink-0 items-center justify-center md:h-16 md:w-16"
        >
            <PublicAsset src={FRIEND_LIST_ASSETS.openButton} alt="" className="block h-auto w-10 select-none md:w-14" />
        </button>
    )
}
