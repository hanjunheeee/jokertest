// 설정 줄 틀: 제목·설명 + 오른쪽 조작 칸 (좁으면 조작 칸이 아랫줄로 내려감)
// CheckRow·StepperRow·RoleCompositionBlock이 씀
const TITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:1.02rem] font-bold leading-tight text-[#1a1008]"
const DESC_CLASS =
  "mt-0.5 font-subheading app-text-scaled [--app-text-size:0.82rem] leading-snug text-[#2a1810]/85"

// 설정 줄 하나
export default function SettingRow({ label, description, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-[#8b7355]/35 py-2.5 last:border-b-0" data-setup-row>
      <div className="min-w-[9rem] flex-1">
        <p className={TITLE_CLASS}>{label}</p>
        {description ? <p className={DESC_CLASS}>{description}</p> : null}
      </div>
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  )
}
