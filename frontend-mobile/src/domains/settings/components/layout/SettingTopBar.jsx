// 설정 위 줄 (뒤로 가기 그림 버튼 + 제목)
// pages/SettingPage.jsx가 씀
import { NAVIGATION_ASSETS } from "@/shared/constants/navigationAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 뒤로 버튼은 누르는 칸 48px, 제목은 가운데 (오른쪽 빈 칸으로 균형)
export default function SettingTopBar({ onBack }) {
    return (
        <header className="relative flex h-14 shrink-0 items-center justify-between px-2">
            <button
                type="button"
                aria-label="뒤로 가기"
                data-sfx-kind="ui-cancel"
                onClick={onBack}
                className="flex size-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-95"
            >
                <PublicAsset src={NAVIGATION_ASSETS.backButton} alt="" className="block h-auto w-11 select-none" />
            </button>
            <h1 className="pointer-events-none absolute inset-x-16 truncate text-center font-display app-text-scaled [--app-text-size:1.35rem] text-[#f5e6c8] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
                설정
            </h1>
            <span className="size-12 shrink-0" aria-hidden="true" />
        </header>
    )
}
