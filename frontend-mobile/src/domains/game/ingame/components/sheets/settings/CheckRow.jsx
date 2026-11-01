// 설정 시트 체크 한 줄: 왼쪽 이름, 오른쪽 체크 칸
// 채팅 탭·사운드 탭이 씀 (데스크톱 SettingCheckboxRow와 같은 구성)
import CheckBox from "../parts/CheckBox.jsx"
import { ROW_LABEL_CLASS, ROW_PLATE_CLASS } from "./rowStyle.js"

// 체크 칸 이름은 줄 이름과 같게 둠 (화면 읽기용)
export default function CheckRow({ label, checked, onChange }) {
  return (
    <div className={`${ROW_PLATE_CLASS} justify-between`} data-setting-row>
      <span className={`${ROW_LABEL_CLASS} flex-1`}>{label}</span>
      <CheckBox ariaLabel={label} checked={checked} onChange={onChange} />
    </div>
  )
}
