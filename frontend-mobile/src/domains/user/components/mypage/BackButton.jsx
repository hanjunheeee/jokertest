// 뒤로 가기 그림 버튼 (데스크톱 BackButton 그림, 44px)
// TopBar가 씀

import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 누르면 취소 소리 (전역 효과음이 data-sfx-kind를 읽음)
export default function BackButton({ onClick }) {
    return (
        <button
            type="button"
            aria-label="뒤로 가기"
            onClick={onClick}
            data-sfx-kind="ui-cancel"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90"
        >
            <PublicAsset src={NAVIGATION_ASSETS.backButton} alt="" className="block h-full w-full select-none object-contain" />
        </button>
    )
}
