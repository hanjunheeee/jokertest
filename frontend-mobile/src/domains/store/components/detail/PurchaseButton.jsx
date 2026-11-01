// 구매 그림 버튼 (데스크톱 구매 버튼 그림, 높이 44px 이상)
// detail/DetailSheet·bottom/BulkBar·bulk/BulkSheet가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"

// 글자: 따로 받은 문구 > 보유중 > 구매 순서 (데스크톱 StorePurchaseButton과 같음)
export default function PurchaseButton({ onClick, disabled = false, owned = false, label = null, className = "w-32", sfx }) {
    const text = label ?? (owned ? "보유중" : "구매")

    return (
        <button
            type="button"
            className={`relative h-12 shrink-0 cursor-pointer border-0 bg-transparent p-0 ${disabled ? "cursor-not-allowed opacity-45" : "active:opacity-85"} ${className}`}
            style={{ outline: "none" }}
            aria-label={text}
            disabled={disabled}
            onClick={onClick}
            data-sfx-kind={sfx}
        >
            <PublicAsset src={STORE_ASSETS.purchaseButton} alt="" className="absolute inset-0 block h-full w-full select-none object-fill" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading app-text-scaled [--app-text-size:0.95rem] font-bold text-[#f5f0e6] [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]">
                {text}
            </span>
        </button>
    )
}
