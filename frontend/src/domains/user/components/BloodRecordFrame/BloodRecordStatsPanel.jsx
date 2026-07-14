import BloodRecordStatRow from "@/domains/user/components/BloodRecordFrame/BloodRecordStatRow.jsx"
import { BLOOD_RECORD_CONTENT_INSET } from "@/domains/user/constants/bloodRecordFrameStyle.js"

export default function BloodRecordStatsPanel({ stats }) {
  return (
    // 프레임 이미지 위에 얹는 텍스트 영역입니다.
    // 클릭을 막을 필요가 없어서 pointer-events-none을 둡니다.
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
