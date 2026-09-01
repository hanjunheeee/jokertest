import { BLOOD_RECORD_STATS, MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import BloodRecordStatsPanel from "@/domains/user/components/BloodRecordFrame/BloodRecordStatsPanel.jsx"
import { BLOOD_RECORD_FRAME_IMG_CLASS } from "@/domains/user/constants/myPageLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 마이페이지의 "피의 기록" 프레임을 그리는 컴포넌트입니다.
// 프레임 이미지는 여기서 그리고, 안쪽 기록 목록은 BloodRecordStatsPanel이 담당합니다.
export default function BloodRecordFrame({
  src = MY_PAGE_ASSETS.bloodRecordFrame,
  stats = BLOOD_RECORD_STATS,
  showText = true,
  className = BLOOD_RECORD_FRAME_IMG_CLASS,
}) {
  return (
    <div className="relative block w-full [container-type:inline-size]">
      {/* 피의 기록 배경 프레임 이미지입니다. */}
      <PublicAsset src={src} alt="" className={className} />

      {/* showText가 true일 때만 프레임 위에 기록 텍스트를 올립니다. */}
      {showText ? <BloodRecordStatsPanel stats={stats} /> : null}
    </div>
  )
}
