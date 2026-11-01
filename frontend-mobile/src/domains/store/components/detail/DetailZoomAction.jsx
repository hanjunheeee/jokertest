// 설명 시트 안 보조 버튼 (카드 사망 모습 미리보기·스킨 전신 보기·테두리 크게 보기)
// detail/DetailSheet가 씀, 칸 위 작은 아이콘을 폰에서 글자 버튼으로도 한 번 더 둠
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import {
    getProfileBorderZoomItem,
    isPlayerCardStoreItem,
    isProfileBorderStoreItem,
    isSkinStoreItem,
} from "@/domains/store/constants/storeItems.js"

const BTN_CLASS =
    "flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-[#8b7355]/45 bg-[#1a0f0a]/08 px-3 font-subheading app-text-scaled [--app-text-size:0.88rem] font-bold text-[#2a1810] active:bg-[#1a0f0a]/16"

// 상품 종류에 맞는 버튼 하나 (해당 없으면 안 그림)
export default function DetailZoomAction({ item, previewDead, onToggleDeadPreview, onOpenSkinZoom, onOpenProfileBorderZoom }) {
    let config = null
    if (isPlayerCardStoreItem(item)) {
        config = {
            text: previewDead ? "생존 모습 보기" : "사망 모습 보기",
            src: STORE_ASSETS.previewToggleButton,
            pressed: previewDead,
            run: () => onToggleDeadPreview(item.id),
        }
    } else if (isSkinStoreItem(item)) {
        config = { text: "전신 보기", src: STORE_ASSETS.expandPreviewButton, run: () => onOpenSkinZoom(item) }
    } else if (isProfileBorderStoreItem(item)) {
        config = { text: "크게 보기", src: STORE_ASSETS.expandPreviewButton, run: () => onOpenProfileBorderZoom(getProfileBorderZoomItem(item)) }
    }
    if (!config) return null

    return (
        <button type="button" className={BTN_CLASS} style={{ outline: "none" }} aria-pressed={config.pressed} onClick={config.run}>
            <PublicAsset src={config.src} alt="" className="block h-5 w-5 select-none object-contain" />
            {config.text}
        </button>
    )
}
