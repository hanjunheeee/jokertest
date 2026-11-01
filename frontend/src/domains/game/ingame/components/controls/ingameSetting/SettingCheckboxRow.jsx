// 설정 창 체크 한 줄: 왼쪽 이름, 오른쪽 체크 칸
// 채팅 탭·사운드 탭이 사용
import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  CHECKBOX_CLASS,
  ROW_LABEL_CLASS,
  ROW_PLATE_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import CheckBox from "@/shared/ui/CheckBox.jsx"

// 체크 칸 이름은 줄 이름과 같게 둠 (화면 읽기용)
export default function SettingCheckboxRow({ label, checked, onChange }) {
  return (
    <div className={`${ROW_PLATE_CLASS} justify-between`} data-setting-row>
      <span className={`${ROW_LABEL_CLASS} min-w-0 flex-1`}>{label}</span>
      <CheckBox
        ariaLabel={label}
        checked={checked}
        onChange={onChange}
        checkboxSrc={INGAME_SETTING_ASSETS.checkbox}
        checkMarkSrc={INGAME_SETTING_ASSETS.checkMark}
        className={CHECKBOX_CLASS}
      />
    </div>
  )
}
