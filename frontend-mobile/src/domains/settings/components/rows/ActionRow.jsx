// 이름 + 동작 버튼 한 줄 (튜토리얼 다시 보기·설정 초기화)
// tabs/GeneralTab.jsx가 씀
import ActionButton from "../controls/ActionButton.jsx"
import { LABEL_CLASS, ROW_CLASS } from "../../constants/settingStyles.js"

// 마지막 줄은 구분선 없음
export default function ActionRow({ label, buttonLabel, onClick }) {
    return (
        <div className={`${ROW_CLASS} last:border-b-0`}>
            <span className={LABEL_CLASS}>{label}</span>
            <ActionButton label={buttonLabel} onClick={onClick} />
        </div>
    )
}
