import { SUMMARY_BLOOD_RECORD_CLASS, SUMMARY_PANEL_CLASS } from "../../constants/myPageLayoutStyle.js"
import BloodRecordFrame from "../BloodRecordFrame.jsx"

export default function MyPageSummaryPanel({ stats }) {
  return (
    <div className={SUMMARY_PANEL_CLASS}>
      <div className={SUMMARY_BLOOD_RECORD_CLASS}>
        <BloodRecordFrame stats={stats} />
      </div>
    </div>
  )
}
