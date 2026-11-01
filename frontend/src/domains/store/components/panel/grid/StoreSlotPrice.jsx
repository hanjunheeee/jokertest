// 상품 칸 아래 가격 줄 (충전 상품은 다이아·원, 가격 미정은 문구, 나머지는 골드)
// StoreItemSlot이 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import { isStorePricePending } from "../../../constants/storeItems.js"
import { STORE_ASSETS } from "../../../constants/storeAssets.js"
import {
  STORE_SLOT_PRICE_AMOUNT_CLASS,
  STORE_SLOT_PRICE_CLASS,
  STORE_SLOT_PRICE_ICON_CLASS,
  STORE_SLOT_PRICE_SELECTED_CLASS,
  STORE_SLOT_PRICE_TEXT_CLASS,
} from "../../../constants/storeLayoutStyle.js"

// kind가 있으면 충전 상품: 다이아로 사면 다이아 아이콘, 원화면 금액 + 원
export default function StoreSlotPrice({ item, priceAmount, selected }) {
  return (
    <div className={`${STORE_SLOT_PRICE_CLASS} ${selected ? STORE_SLOT_PRICE_SELECTED_CLASS : ""}`}>
      {item.kind ? (
        item.payCurrency === "DIAMOND" ? (
          <>
            <PublicAsset
              src={STORE_ASSETS.premiumCurrencyIcon}
              alt=""
              className={STORE_SLOT_PRICE_ICON_CLASS}
            />
            <span className={STORE_SLOT_PRICE_AMOUNT_CLASS}>{item.payAmount}</span>
          </>
        ) : (
          <span className={STORE_SLOT_PRICE_TEXT_CLASS}>{item.payAmount.toLocaleString("ko-KR")}원</span>
        )
      ) : isStorePricePending({ priceAmount }) ? (
        <span className={STORE_SLOT_PRICE_TEXT_CLASS}>{priceAmount}</span>
      ) : (
        <>
          <PublicAsset
            src={STORE_ASSETS.currencyIcon}
            alt=""
            className={STORE_SLOT_PRICE_ICON_CLASS}
          />
          <span className={STORE_SLOT_PRICE_AMOUNT_CLASS}>{priceAmount}</span>
        </>
      )}
    </div>
  )
}
