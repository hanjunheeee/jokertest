import { MY_PAGE_SUMMARY_BLOOD_RECORD_CLASS, MY_PAGE_SUMMARY_PANEL_CLASS } from "@/domains/user/constants/myPageLayoutStyle.js"
import BloodRecordFrame from "@/domains/user/components/BloodRecordFrame.jsx"

export default function MyPageSummaryPanel({ stats }) {
  return (
    <div className={MY_PAGE_SUMMARY_PANEL_CLASS}>
      <div className={MY_PAGE_SUMMARY_BLOOD_RECORD_CLASS}>
        <BloodRecordFrame stats={stats} />
      </div>
    </div>
  )
}
