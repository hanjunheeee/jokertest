// 이름 + 체크박스 한 줄 (전체화면·알림·효과음 음소거)
// tabs/GeneralTab.jsx·tabs/SoundTab.jsx가 씀
import CheckBox from "../controls/CheckBox.jsx"
import { LABEL_CLASS, ROW_CLASS } from "../../constants/settingStyles.js"

// 이름은 왼쪽, 체크는 오른쪽
export default function ToggleRow({ label, checked, onChange }) {
    return (
        <div className={ROW_CLASS}>
            <span className={LABEL_CLASS}>{label}</span>
            <CheckBox ariaLabel={label} checked={checked} onChange={onChange} />
        </div>
    )
}
