// 상품 칸 위 줄 (스킨 안내 문구 + 일괄구매 켜기 버튼)
// grid/ItemGrid가 상품이 있고 일괄구매를 보일 분류일 때 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { SKIN_CATEGORY_NOTICE } from "@/domains/store/constants/storeNotices.js"

// 안내 문구가 없어도 빈칸을 둬서 버튼을 오른쪽에 붙임 (데스크톱과 같음)
export default function GridToolbar({ showSkinNotice, active, onToggle }) {
    return (
        <div className="mb-2 flex items-center justify-between gap-2">
            {showSkinNotice ? (
                <p className="flex min-w-0 flex-1 items-center gap-1.5">
                    <PublicAsset src={STORE_ASSETS.warningIcon} alt="" className="block h-4 w-auto shrink-0 select-none object-contain" />
                    <span className="font-subheading app-text-scaled [--app-text-size:0.78rem] font-extrabold leading-snug text-[#2a0e08]">
                        {SKIN_CATEGORY_NOTICE}
                    </span>
                </p>
            ) : (
                <span aria-hidden="true" className="min-w-0 flex-1" />
            )}
            {/* 켜지면 초록 그림, 꺼지면 회색 그림 */}
            <button
                type="button"
                className="relative h-11 w-[6.25rem] shrink-0 cursor-pointer border-0 bg-transparent p-0 active:opacity-85"
                style={{ outline: "none" }}
                aria-pressed={active}
                onClick={onToggle}
            >
                <PublicAsset
                    src={active ? STORE_ASSETS.purchaseButton : STORE_ASSETS.inactiveButton}
                    alt=""
                    className="absolute inset-0 block h-full w-full select-none object-fill"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:0.85rem] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]">
                    일괄구매
                </span>
            </button>
        </div>
    )
}
