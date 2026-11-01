import { INGAME_SETTING_ASSETS } from "../../../constants/controls/ingameSetting/ingameSettingAssets.js"
import {
  CHECKBOX_CLASS,
  ROW_LABEL_CLASS,
  ROW_PLATE_CLASS,
} from "../../../constants/controls/ingameSetting/ingameSettingLayout.js"
import CheckBox from "@/shared/ui/CheckBox.jsx"

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
