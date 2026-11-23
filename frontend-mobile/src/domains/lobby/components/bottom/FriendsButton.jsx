// 친구 목록 여는 그림 버튼
// BottomBar가 씀
import { LOBBY_MOBILE_ASSETS } from "@m/domains/lobby/constants/lobbyMobileAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 FriendListToggleButton과 같은 이름·눌림 (누르는 칸만 44px 이상)
export default function FriendsButton({ open, onOpen, ariaLabel = "친구 목록" }) {
    return (
        <button
            type="button"
            aria-label={ariaLabel}
            aria-expanded={open}
            onClick={onOpen}
            className="interactive-scale flex h-14 w-16 shrink-0 items-center justify-center md:h-[4.5rem] md:w-[5.5rem]"
        >
            <PublicAsset src={LOBBY_MOBILE_ASSETS.friendsButton} alt="" className="block h-auto w-full select-none" />
        </button>
    )
}
