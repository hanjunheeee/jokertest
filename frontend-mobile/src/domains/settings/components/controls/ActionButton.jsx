// 초록 그림 버튼 위에 글자 겹친 동작 버튼 (다시 보기·초기화)
// rows/ActionRow.jsx가 씀
import { SETTING_ASSETS } from "@/domains/settings/constants/settingAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import { IMAGE_LABEL_CLASS } from "../../constants/settingStyles.js"

// 그림 비율(215×65) 그대로, 폭 8rem이면 높이 44px 넘음
export default function ActionButton({ label, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="relative block min-h-11 w-32 shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform active:scale-95"
        >
            <PublicAsset src={SETTING_ASSETS.actionButton} alt="" className="block h-auto w-full select-none" />
            <span className={`${IMAGE_LABEL_CLASS} app-text-scaled [--app-text-size:0.85rem]`}>{label}</span>
        </button>
    )
}
