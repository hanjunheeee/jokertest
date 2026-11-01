// 그림 체크박스 (그림은 32px, 누르는 칸은 48px)
// rows/ToggleRow.jsx가 씀
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 그림보다 넓은 투명 칸으로 손가락 빗나감 줄임
export default function CheckBox({ checked, onChange, ariaLabel }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={ariaLabel}
            onClick={() => onChange(!checked)}
            className="-mr-2 flex size-12 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
        >
            <span className="relative block w-8">
                <PublicAsset src={SETTING_ASSETS.checkbox} alt="" className="block h-auto w-full select-none" />
                {/* 켜졌을 때만 체크 표시 */}
                {checked ? (
                    <PublicAsset
                        src={SETTING_ASSETS.checkMark}
                        alt=""
                        className="pointer-events-none absolute inset-[12%] block h-auto w-[76%] select-none"
                    />
                ) : null}
            </span>
        </button>
    )
}
