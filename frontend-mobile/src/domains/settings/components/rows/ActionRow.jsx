// 이름 + 동작 버튼 한 줄 (튜토리얼 다시 보기·설정 초기화)
// tabs/GeneralTab.jsx가 씀
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import ImageButton from "@m/shared/ui/button/ImageButton.jsx"
import { ACTION_BUTTON_LOOK, LABEL_CLASS, ROW_CLASS } from "../../constants/settingStyles.js"

// 마지막 줄은 구분선 없음
export default function ActionRow({ label, buttonLabel, onClick }) {
    return (
        <div className={`${ROW_CLASS} last:border-b-0`}>
            <span className={LABEL_CLASS}>{label}</span>
            <ImageButton look={ACTION_BUTTON_LOOK} src={SETTING_ASSETS.actionButton} label={buttonLabel} onClick={onClick} />
        </div>
    )
}
