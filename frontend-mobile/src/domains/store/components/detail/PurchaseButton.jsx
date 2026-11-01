// 구매 그림 버튼 (데스크톱 구매 버튼 그림·글자 class, 높이 44px 이상)
// detail/ItemDetail·bulk/BulkSummary가 씀
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { PURCHASE_LABEL_CLASS } from "@/domains/store/constants/storeLayoutStyle.js"

// 글자: 따로 받은 문구 > 보유중 > 구매 순서 (데스크톱 StorePurchaseButton과 같음)
// 꺼짐 흐림은 데스크톱 구매 버튼만 있음 (일괄구매 창 구매하기는 dimDisabled=false)
export default function PurchaseButton({ onClick, disabled = false, owned = false, label = null, className = "w-28", labelClassName = PURCHASE_LABEL_CLASS, dimDisabled = true, sfx }) {
    const text = label ?? (owned ? "보유중" : "구매")

    return (
        <button
            type="button"
            className={`relative h-11 shrink-0 cursor-pointer border-0 bg-transparent p-0 ${disabled ? `cursor-not-allowed ${dimDisabled ? "opacity-45" : ""}` : "active:opacity-90"} ${className}`}
            style={{ outline: "none" }}
            aria-label={text}
            disabled={disabled}
            onClick={onClick}
            data-sfx-kind={sfx}
        >
            <PublicAsset src={STORE_ASSETS.purchaseButton} alt="" className="absolute inset-0 block h-full w-full select-none object-fill" />
            <span className={labelClassName}>{text}</span>
        </button>
    )
}
