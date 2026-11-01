// 계정 폼 확인(submit) 버튼 (수락 버튼 그림 + 글자)
// FormActions·DiscordSection이 씀

import { CONFIRM_BTN_SRC } from "@/domains/user/constants/accountPanelStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 폼 submit이라 누르면 폼 보내기, 보내는 중엔 잠김
export default function ConfirmButton({ label, disabled = false }) {
    return (
        <button
            type="submit"
            disabled={disabled}
            className="relative ml-auto block h-11 w-32 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
            <PublicAsset src={CONFIRM_BTN_SRC} alt="" className="absolute inset-0 block h-full w-full select-none" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[0.9rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                {label}
            </span>
        </button>
    )
}
