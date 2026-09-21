import PublicAsset from "@/shared/ui/PublicAsset"
import { isStorePricePending } from "../../constants/storeItems.js"
import { STORE_ASSETS } from "../../constants/storeAssets.js"
import {
  STORE_DETAIL_IMAGE_CLASS,
  STORE_DETAIL_IMAGE_WRAP_CLASS,
  STORE_DETAIL_INFO_CLASS,
  STORE_DETAIL_META_CLASS,
  STORE_DETAIL_META_DIVIDER_CLASS,
  STORE_DETAIL_NAME_CLASS,
  STORE_DETAIL_NAME_ROW_CLASS,
  STORE_DETAIL_PRICE_AMOUNT_CLASS,
  STORE_DETAIL_PRICE_GROUP_CLASS,
  STORE_DETAIL_PRICE_ICON_CLASS,
  STORE_DETAIL_PRICE_LABEL_CLASS,
  STORE_DETAIL_PRICE_ROW_CLASS,
  STORE_DETAIL_PRICE_TEXT_CLASS,
  STORE_DETAIL_ROW_CLASS,
  STORE_DETAIL_SECTION_CLASS,
  STORE_DETAIL_TAG_CLASS,
  STORE_PURCHASE_BTN_CLASS,
  STORE_PURCHASE_BTN_IMAGE_CLASS,
  STORE_PURCHASE_LABEL_CLASS,
} from "../../constants/storeLayoutStyle.js"

// 선택한 아이템을 구매하는 버튼입니다. 이미 보유한 상품이면 "구매" 대신 "보유중"을 보여주고
// 클릭해도 아무 일도 하지 않는다(F-09 R-IMPL, AC-06 재검토 — 서버가 이미 거부하는 것과
// 별개로, 재로그인 후 실제로 복원된 소유권이 화면에도 드러나야 한다).
// F-32c: label이 있으면(충전·골드 구매·설정 대기·처리 중 등) 표시 문구와 접근성 이름에 함께 쓴다.
function StorePurchaseButton({ onClick, disabled = false, owned = false, label = null }) {
  const text = label ?? (owned ? "보유중" : "구매")
  return (
    <button
      type="button"
      className={`${STORE_PURCHASE_BTN_CLASS} ${disabled ? "cursor-not-allowed opacity-45" : "hover:opacity-90"}`}
      style={{ outline: "none" }}
      aria-label={text}
      disabled={disabled}
      onClick={onClick}
    >
      <PublicAsset
        src={STORE_ASSETS.purchaseButton}
        alt=""
        className={STORE_PURCHASE_BTN_IMAGE_CLASS}
      />
      <span className={STORE_PURCHASE_LABEL_CLASS}>{text}</span>
    </button>
  )
}

const CURRENCY_UNIT = { KRW: "원", DIAMOND: "다이아", GOLD: "골드" }
const formatAmount = (amount, currency) =>
  `${currency === "KRW" ? amount.toLocaleString("ko-KR") : amount} ${CURRENCY_UNIT[currency] ?? currency}`

/** 상점 하단의 선택 상품 상세 정보 패널입니다. */
export default function StoreSelectedItemDetail({
  item,
  displayIcon = item.icon,
  onPurchaseClick,
  purchaseDisabled = false,
  purchaseLabel = null,
  owned = false,
}) {
  return (
    <section className={STORE_DETAIL_SECTION_CLASS} aria-label="선택한 아이템 정보">
      <div className={STORE_DETAIL_ROW_CLASS}>
        <div className={STORE_DETAIL_IMAGE_WRAP_CLASS}>
          <PublicAsset src={displayIcon} alt="" className={STORE_DETAIL_IMAGE_CLASS} />
        </div>

        <div className={STORE_DETAIL_INFO_CLASS}>
          <div className={STORE_DETAIL_NAME_ROW_CLASS}>
            <h2 className={STORE_DETAIL_NAME_CLASS}>{item.name}</h2>
            {item.tag ? <span className={STORE_DETAIL_TAG_CLASS}>{item.tag}</span> : null}
          </div>

          <p className={STORE_DETAIL_META_CLASS}>
            {item.category}
            <span className={STORE_DETAIL_META_DIVIDER_CLASS}>·</span>
            {item.grade}
          </p>

          <div className={STORE_DETAIL_PRICE_ROW_CLASS}>
            <div className={STORE_DETAIL_PRICE_GROUP_CLASS}>
              <span className={STORE_DETAIL_PRICE_LABEL_CLASS}>{item.kind ? "결제" : "구매 가격"}</span>
              {item.kind ? (
                // 서버 상품표의 결제·지급·보너스를 각각 그대로 보여 준다.
                <span className={STORE_DETAIL_PRICE_AMOUNT_CLASS}>
                  <span data-testid="currency-pay">{formatAmount(item.payAmount, item.payCurrency)}</span>
                  <span className={STORE_DETAIL_META_DIVIDER_CLASS}>→</span>
                  <span data-testid="currency-grant">지급 {formatAmount(item.grantAmount, item.grantCurrency)}</span>
                  {item.bonusAmount > 0 ? (
                    <span data-testid="currency-bonus"> · 보너스 +{formatAmount(item.bonusAmount, item.grantCurrency)}</span>
                  ) : null}
                </span>
              ) : isStorePricePending(item) ? (
                <span className={STORE_DETAIL_PRICE_TEXT_CLASS}>{item.priceAmount}</span>
              ) : (
                <>
                  <PublicAsset
                    src={STORE_ASSETS.currencyIcon}
                    alt=""
                    className={STORE_DETAIL_PRICE_ICON_CLASS}
                  />
                  <span className={STORE_DETAIL_PRICE_AMOUNT_CLASS}>{item.priceAmount} 골드</span>
                </>
              )}
            </div>

            {item.category !== "이모티콘" ? <StorePurchaseButton onClick={onPurchaseClick} disabled={purchaseDisabled} owned={owned} label={purchaseLabel} /> : <span>표시 전용 · 준비중</span>}
          </div>
        </div>
      </div>
    </section>
  )
}
