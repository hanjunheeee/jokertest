// 마이페이지 가운데 전적 칸 (피의 기록)
// MyPageLayout이 씀
import { SUMMARY_BLOOD_RECORD_CLASS, SUMMARY_PANEL_CLASS } from "../../constants/myPageLayoutStyle.js"
import BloodRecordFrame from "../BloodRecordFrame.jsx"

// 받은 전적을 피의 기록 틀에 넘김
export default function MyPageSummaryPanel({ stats }) {
  return (
    <div className={SUMMARY_PANEL_CLASS}>
      <div className={SUMMARY_BLOOD_RECORD_CLASS}>
        <BloodRecordFrame stats={stats} />
      </div>
    </div>
  )
}
