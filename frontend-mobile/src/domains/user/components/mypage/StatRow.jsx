// 피의 기록 한 줄 (이름 · 값, 둘째 줄부터 위에 구분선)
// BloodRecord가 씀, 글자 모양은 데스크톱 상수 그대로 (틀 폭 기준 cqi)

import {
    MY_PAGE_BLOOD_ROW_LABEL_CLASS,
    MY_PAGE_BLOOD_ROW_OFFSET,
    MY_PAGE_BLOOD_ROW_VALUE_CLASS,
} from "@m/domains/user/constants/myPageMobileLayout.js"
import { BLOOD_RECORD_TEXT_SHADOW } from "@/domains/user/constants/myPageLayoutStyle.js"

// 구분선은 showDivider일 때만
export default function StatRow({ label, value, showDivider, rowIndex = 0 }) {
    const rowOffset = MY_PAGE_BLOOD_ROW_OFFSET[rowIndex] ?? ""

    return (
        <div className={`flex flex-col gap-[0.35em] ${rowOffset}`}>
            {showDivider ? (
                <div className="h-px shrink-0 bg-gradient-to-r from-transparent via-[#6b3a2a]/55 to-transparent" aria-hidden="true" />
            ) : null}

            <div className="flex items-center justify-between gap-[0.5em] py-[0.15em]">
                <span className={MY_PAGE_BLOOD_ROW_LABEL_CLASS} style={{ textShadow: BLOOD_RECORD_TEXT_SHADOW }}>
                    {label}
                </span>
                <span className={MY_PAGE_BLOOD_ROW_VALUE_CLASS} style={{ textShadow: BLOOD_RECORD_TEXT_SHADOW }}>
                    {value}
                </span>
            </div>
        </div>
    )
}
