import BloodRecordStatRow from "./BloodRecordStatRow.jsx"
import { BLOOD_RECORD_CONTENT_INSET } from "../../constants/myPageLayoutStyle.js"

export default function BloodRecordStatsPanel({ stats }) {
  return (
    <div className="pointer-events-none absolute flex flex-col justify-evenly gap-[0.2em]" style={BLOOD_RECORD_CONTENT_INSET}>
      {stats.map((row, index) => (
        <BloodRecordStatRow
          key={row.label}
          label={row.label}
          value={row.value}
          showDivider={index > 0}
        />
      ))}
    </div>
  )
}
