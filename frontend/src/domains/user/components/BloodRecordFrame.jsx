// 피의 기록 틀 (틀 그림 + 전적 줄)
// MyPageSummaryPanel·시험이 씀
import { BLOOD_RECORD_STATS, MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import BloodRecordStatsPanel from "./BloodRecordFrame/BloodRecordStatsPanel.jsx"
import { BLOOD_RECORD_FRAME_IMG_CLASS } from "../constants/myPageLayoutStyle.js"
import PublicAsset from "../../../shared/ui/PublicAsset.jsx"

// 기본값은 틀 그림·빈 전적, 실제로는 전적을 넘김
export default function BloodRecordFrame({
  src = MY_PAGE_ASSETS.bloodRecordFrame,
  stats = BLOOD_RECORD_STATS,
  showText = true,
  className = BLOOD_RECORD_FRAME_IMG_CLASS,
}) {
  return (
    <div className="relative block w-full [container-type:inline-size]">
      <PublicAsset src={src} alt="" className={className} />

      {showText ? <BloodRecordStatsPanel stats={stats} /> : null}
    </div>
  )
}
