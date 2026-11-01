// 상품 칸 위 줄 (스킨 안내 문구 또는 빈칸 + 일괄구매 켜기 버튼)
// grid/ItemGrid가 상품이 있고 일괄구매를 보일 분류일 때 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { SKIN_CATEGORY_NOTICE } from "@/domains/store/constants/storeNotices.js"
import {
    BULK_BTN_LABEL_CLASS,
    BULK_BTN_WRAP_CLASS,
    SKIN_NOTICE_ICON_CLASS,
    SKIN_NOTICE_TEXT_CLASS,
    STORE_SKIN_NOTICE_CLASS,
} from "@/domains/store/constants/storeLayoutStyle.js"

// 안내 문구가 없어도 빈칸을 둬서 버튼을 오른쪽에 붙임 (데스크톱과 같음), 버튼만 높이 44px
export default function GridToolbar({ showSkinNotice, active, onToggle }) {
    return (
        <div className={BULK_BTN_WRAP_CLASS}>
            {showSkinNotice ? (
                <p className={STORE_SKIN_NOTICE_CLASS}>
                    <PublicAsset src={STORE_ASSETS.warningIcon} alt="" className={SKIN_NOTICE_ICON_CLASS} />
                    <span className={SKIN_NOTICE_TEXT_CLASS}>{SKIN_CATEGORY_NOTICE}</span>
                </p>
            ) : (
                <span aria-hidden="true" className="min-w-0 flex-1" />
            )}
            {/* 켜지면 수락 버튼 그림, 꺼지면 미선택 그림 */}
            <button
                type="button"
                className="relative h-11 w-[6.25rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 active:opacity-90"
                style={{ outline: "none" }}
                aria-pressed={active}
                onClick={onToggle}
            >
                <PublicAsset
                    src={active ? STORE_ASSETS.purchaseButton : STORE_ASSETS.inactiveButton}
                    alt=""
                    className="absolute inset-0 block h-full w-full select-none object-fill"
                />
                <span className={BULK_BTN_LABEL_CLASS}>일괄구매</span>
            </button>
        </div>
    )
}
