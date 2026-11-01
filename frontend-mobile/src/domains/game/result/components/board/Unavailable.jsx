// 그릴 결과가 없을 때 안내 (새로고침 등으로 결과 값이 사라짐)
// pages/GameResultPage가 씀, 글자는 데스크톱 상수 그대로
import {
    RESULT_UNAVAILABLE_BODY,
    RESULT_UNAVAILABLE_TITLE,
} from "@/domains/game/result/constants/gameResultUnavailable.js"

// 결과 없음 안내 (가운데 정렬, 좁은 폭에서 줄바꿈)
export default function Unavailable() {
    return (
        <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <p role="alert" className="font-subheading text-xl font-bold text-[#f5e6c8] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
                {RESULT_UNAVAILABLE_TITLE}
            </p>
            <p className="max-w-[36rem] font-subheading text-[0.95rem] leading-relaxed text-[#f0e0c8]/85">
                {RESULT_UNAVAILABLE_BODY}
            </p>
        </div>
    )
}
