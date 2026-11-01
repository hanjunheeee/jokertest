// 친구 목록 여는 그림 버튼 (받은 게임 초대 수 배지)
// BottomBar가 씀
import { FRIEND_LIST_ASSETS } from "@/domains/lobby/constants/friendListAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import CountBadge from "@m/domains/lobby/components/bottom/CountBadge.jsx"

// 그림만 있는 버튼이라 이름에 초대 수를 같이 실음
export default function FriendsButton({ open, onOpen, inviteCount }) {
    return (
        <button
            type="button"
            aria-label={inviteCount > 0 ? `친구 목록 (게임 초대 ${inviteCount}개)` : "친구 목록"}
            aria-expanded={open}
            onClick={onOpen}
            className="relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform duration-200 active:scale-95 md:h-16 md:w-16"
        >
            <PublicAsset src={FRIEND_LIST_ASSETS.openButton} alt="" className="block h-auto w-10 select-none md:w-14" />
            <CountBadge count={inviteCount} />
        </button>
    )
}
