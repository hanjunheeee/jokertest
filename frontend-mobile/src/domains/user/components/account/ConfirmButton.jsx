// 계정 폼 확인(submit) 버튼 (수락 버튼 그림 + 글자)
// FormActions·DiscordSection이 씀

import { CONFIRM_BTN_SRC } from "@/domains/user/constants/accountPanelStyle.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"

// 데스크톱 CONFIRM_BTN 모양, 그림 비율 그대로 (215×65라 폭 9.25rem이면 높이 44px 넘음)
// 데스크톱 hover 흐림을 누를 때로 옮김, 잠김 흐림은 같음
const CONFIRM_LOOK = {
    button: "relative ml-auto block w-[9.25rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity active:opacity-85 disabled:cursor-not-allowed disabled:opacity-40",
    img: "block h-auto w-full select-none",
    label: "pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]",
}

// 폼 submit이라 누르면 폼 보내기, 보내는 중엔 잠김
export default function ConfirmButton({ label, disabled = false }) {
    return <ImageButton type="submit" look={CONFIRM_LOOK} src={CONFIRM_BTN_SRC} label={label} disabled={disabled} />
}
