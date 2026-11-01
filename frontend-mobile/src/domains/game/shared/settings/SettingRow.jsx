// 설정 줄 틀: 제목·설명 + 오른쪽 조작 칸 (좁으면 조작 칸이 아랫줄로 내려감)
// shared/settings 아래 StepperRow·ChoiceRow가 씀
import { SETTING_LOOKS } from "./settingLooks.js"

// 제목·설명 글
function RowText({ look, label, description }) {
  return (
    <div className="min-w-[9rem] flex-1">
      <p className={look.title}>{label}</p>
      {description ? <p className={look.desc}>{description}</p> : null}
    </div>
  )
}

// 설정 줄 하나 (look 이름: setup)
export default function SettingRow({ look: lookName, label, description, children }) {
  const look = SETTING_LOOKS[lookName]
  return (
    <div className={look.row} data-setup-row>
      <RowText look={look} label={label} description={description} />
      {look.controlWrap ? <div className={look.controlWrap}>{children}</div> : children}
    </div>
  )
}
