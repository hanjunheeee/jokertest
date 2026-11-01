// 상품 칸 오른쪽 위 보조 버튼 (카드는 사망 모습 미리보기, 스킨은 전신 보기, 프로필 테두리는 크게 보기)
// grid/ItemSlot이 칸 버튼 옆에 따로 붙여 씀 (버튼 안에 버튼을 넣지 않기 위함)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import {
    getProfileBorderZoomItem,
    isPlayerCardStoreItem,
    isProfileBorderStoreItem,
    isSkinStoreItem,
} from "@/domains/store/constants/storeItems.js"

// 누르는 자리는 44px, 그림은 그 안 오른쪽 위에 작게
const BTN_CLASS =
    "absolute right-0 top-0 z-10 flex h-11 w-11 cursor-pointer items-start justify-end border-0 bg-transparent p-1 leading-none active:scale-95"

const IMG_CLASS = "block h-6 w-6 select-none object-contain"

// 상품 종류에 맞는 버튼 하나만 (해당 없으면 안 그림), 누르면 칸 선택으로 번지지 않게 막음
export default function SlotZoomButton({ item, previewDead, onToggleDeadPreview, onOpenSkinZoom, onOpenProfileBorderZoom }) {
    let config = null
    if (isPlayerCardStoreItem(item)) {
        config = {
            label: previewDead ? "생존 상태 미리보기" : "사망 상태 미리보기",
            src: STORE_ASSETS.previewToggleButton,
            pressed: previewDead,
            run: () => onToggleDeadPreview?.(),
        }
    } else if (isSkinStoreItem(item)) {
        config = { label: `${item.name} 전신 보기`, src: STORE_ASSETS.expandPreviewButton, run: () => onOpenSkinZoom?.(item) }
    } else if (isProfileBorderStoreItem(item)) {
        config = {
            label: `${item.name} 프로필 테두리 크게 보기`,
            src: STORE_ASSETS.expandPreviewButton,
            run: () => onOpenProfileBorderZoom?.(getProfileBorderZoomItem(item)),
        }
    }
    if (!config) return null

    return (
        <button
            type="button"
            className={BTN_CLASS}
            style={{ outline: "none" }}
            aria-label={config.label}
            aria-pressed={config.pressed}
            onClick={(event) => {
                event.stopPropagation()
                config.run()
            }}
        >
            <PublicAsset src={config.src} alt="" className={IMG_CLASS} />
        </button>
    )
}
