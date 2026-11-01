// 피의 기록 틀 (틀 그림 + 전적 줄: 전체 판수·승률)
// MyPage가 씀, 데스크톱 BloodRecordFrame·BloodRecordStatsPanel 합친 모양

import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import { BLOOD_RECORD_CONTENT_INSET } from "@/domains/user/constants/myPageLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import StatRow from "./StatRow.jsx"

// 첫 줄 말고는 위에 구분선
export default function BloodRecord({ stats }) {
    return (
        <section aria-label="피의 기록" className="relative w-full [container-type:inline-size]">
            <PublicAsset src={MY_PAGE_ASSETS.bloodRecordFrame} alt="" className="block h-auto w-full select-none" />

            <div className="absolute flex flex-col justify-evenly gap-[0.2em]" style={BLOOD_RECORD_CONTENT_INSET}>
                {(stats ?? []).map((row, index) => (
                    <StatRow key={row.label} label={row.label} value={row.value} showDivider={index > 0} />
                ))}
            </div>
        </section>
    )
}
