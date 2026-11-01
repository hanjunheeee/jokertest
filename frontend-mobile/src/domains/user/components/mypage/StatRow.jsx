// 피의 기록 한 줄 (이름 · 값, 둘째 줄부터 위에 구분선)
// BloodRecord가 씀

import { BLOOD_RECORD_TEXT_SHADOW } from "@/domains/user/constants/myPageLayoutStyle.js"

// 글자는 틀 폭 기준(cqi)이되 폰에서 너무 작아지지 않게 최소값
export default function StatRow({ label, value, showDivider }) {
    return (
        <div className="flex flex-col gap-[0.3em]">
            {showDivider ? (
                <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-[#6b3a2a]/55 to-transparent" aria-hidden="true" />
            ) : null}

            <div className="flex items-center justify-between gap-2">
                <span
                    className="min-w-0 break-keep font-subheading text-[max(0.8rem,3.8cqi)] font-bold leading-snug text-[#3d1810]"
                    style={{ textShadow: BLOOD_RECORD_TEXT_SHADOW }}
                >
                    {label}
                </span>
                <span
                    className="min-w-0 text-right font-subheading text-[max(0.85rem,4cqi)] font-bold leading-snug tracking-wide text-[#2a0e08] tabular-nums"
                    style={{ textShadow: BLOOD_RECORD_TEXT_SHADOW }}
                >
                    {value}
                </span>
            </div>
        </div>
    )
}
