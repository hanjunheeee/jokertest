// 계정 폼 결과 문구 한 줄 (성공·실패 색, 데스크톱 FeedbackMsg 색)
// FormActions·DiscordSection이 씀

import { FEEDBACK_ERROR_CLASS, FEEDBACK_SUCCESS_CLASS } from "@/domains/user/constants/accountPanelStyle.js"

// 문구가 없으면 안 그림, 폰 폭에선 줄바꿈 허용 (가로 스크롤 안 생기게)
export default function Feedback({ msg }) {
    if (!msg) return null

    const colorClass = msg.type === "success" ? FEEDBACK_SUCCESS_CLASS : FEEDBACK_ERROR_CLASS

    return (
        <p
            role={msg.type === "success" ? "status" : "alert"}
            className={`block w-full break-keep font-subheading text-[0.9rem] font-bold leading-snug [text-shadow:0_1px_2px_rgba(255,255,255,0.35)] ${colorClass}`}
        >
            {msg.text}
        </p>
    )
}
