// 고른 상품 설명 칸 (그림·이름·분류·등급·가격·구매 버튼, 단추 바로 아래 꺼진 까닭·구매 결과 안내)
// StorePanel이 고른 상품이 있을 때 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import { isStorePricePending } from "../../constants/storeItems.js"
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import {
  DETAIL_IMG_CLASS,
  DETAIL_IMG_WRAP_CLASS,
  STORE_DETAIL_INFO_CLASS,
  STORE_DETAIL_META_CLASS,
  DETAIL_META_DIVIDER_CLASS,
  STORE_DETAIL_NAME_CLASS,
  DETAIL_NAME_ROW_CLASS,
  DETAIL_PRICE_AMOUNT_CLASS,
  DETAIL_PRICE_GROUP_CLASS,
  DETAIL_PRICE_ICON_CLASS,
  DETAIL_PRICE_LABEL_CLASS,
  DETAIL_PRICE_ROW_CLASS,
  DETAIL_PRICE_TEXT_CLASS,
  STORE_DETAIL_ROW_CLASS,
  DETAIL_SECTION_CLASS,
  STORE_DETAIL_TAG_CLASS,
  PURCHASE_BTN_CLASS,
  PURCHASE_BTN_IMG_CLASS,
  PURCHASE_LABEL_CLASS,
} from "../../constants/storeLayoutStyle.js"

// 구매 버튼 글자: 따로 받은 문구 > 보유중 > 구매 순서
function StorePurchaseButton({ onClick, disabled = false, owned = false, label = null }) {
  const text = label ?? (owned ? "보유중" : "구매")
  return (
    <button
      type="button"
      className={`${PURCHASE_BTN_CLASS} ${disabled ? "cursor-not-allowed opacity-45" : "hover:opacity-90"}`}
      style={{ outline: "none" }}
      aria-label={text}
      disabled={disabled}
      onClick={onClick}
    >
      <PublicAsset
        src={STORE_ASSETS.purchaseButton}
        alt=""
        className={PURCHASE_BTN_IMG_CLASS}
      />
      <span className={PURCHASE_LABEL_CLASS}>{text}</span>
    </button>
  )
}

// 단추 아래 안내 자리: 안내가 하나도 없으면 자리도 안 생김
const NOTICE_WRAP_CLASS = "mt-1 flex flex-col gap-1 empty:hidden"
// 꺼진 까닭 줄: 설명 칸 바탕이 비치는 반투명이라 글자색·바탕색을 둘 다 정해 늘 보이게 (결과 안내 칸과 같은 색)
const BLOCK_REASON_CLASS = "rounded border border-[#9c793d] bg-[#241a10] px-2 py-1 text-sm text-[#f3dfb4]"

// 재화 단위 글자
const CURRENCY_UNIT = { KRW: "원", DIAMOND: "다이아", GOLD: "골드" }
// 금액 + 단위 (원화만 천 단위 쉼표)
const formatAmount = (amount, currency) =>
  `${currency === "KRW" ? amount.toLocaleString("ko-KR") : amount} ${CURRENCY_UNIT[currency] ?? currency}`

// 가격 줄: 충전 상품은 결제→지급(+보너스), 가격 미정은 문구, 나머지는 골드
export default function StoreSelectedItemDetail({
  item,
  displayIcon = item.icon,
  onPurchaseClick,
  purchaseDisabled = false,
  purchaseLabel = null,
  owned = false,
  blockReason = null,
  children = null,
}) {
  return (
    <section className={DETAIL_SECTION_CLASS} aria-label="선택한 아이템 정보">
      <div className={STORE_DETAIL_ROW_CLASS}>
        <div className={DETAIL_IMG_WRAP_CLASS}>
          <PublicAsset src={displayIcon} alt="" className={DETAIL_IMG_CLASS} />
        </div>

        <div className={STORE_DETAIL_INFO_CLASS}>
          <div className={DETAIL_NAME_ROW_CLASS}>
            <h2 className={STORE_DETAIL_NAME_CLASS}>{item.name}</h2>
            {item.tag ? <span className={STORE_DETAIL_TAG_CLASS}>{item.tag}</span> : null}
          </div>

          <p className={STORE_DETAIL_META_CLASS}>
            {item.category}
            <span className={DETAIL_META_DIVIDER_CLASS}>·</span>
            {item.grade}
          </p>

          <div className={DETAIL_PRICE_ROW_CLASS}>
            <div className={DETAIL_PRICE_GROUP_CLASS}>
              <span className={DETAIL_PRICE_LABEL_CLASS}>{item.kind ? "결제" : "구매 가격"}</span>
              {item.kind ? (
                <span className={DETAIL_PRICE_AMOUNT_CLASS}>
                  <span data-testid="currency-pay">{formatAmount(item.payAmount, item.payCurrency)}</span>
                  <span className={DETAIL_META_DIVIDER_CLASS}>→</span>
                  <span data-testid="currency-grant">지급 {formatAmount(item.grantAmount, item.grantCurrency)}</span>
                  {item.bonusAmount > 0 ? (
                    <span data-testid="currency-bonus"> · 보너스 +{formatAmount(item.bonusAmount, item.grantCurrency)}</span>
                  ) : null}
                </span>
              ) : isStorePricePending(item) ? (
                <span className={DETAIL_PRICE_TEXT_CLASS}>{item.priceAmount}</span>
              ) : (
                <>
                  <PublicAsset
                    src={STORE_ASSETS.currencyIcon}
                    alt=""
                    className={DETAIL_PRICE_ICON_CLASS}
                  />
                  <span className={DETAIL_PRICE_AMOUNT_CLASS}>{item.priceAmount} 골드</span>
                </>
              )}
            </div>

            <StorePurchaseButton onClick={onPurchaseClick} disabled={purchaseDisabled} owned={owned} label={purchaseLabel} />
          </div>

          {/* 꺼진 까닭·구매 결과 안내는 구매 단추 바로 아래 (판 맨 위는 단추와 멀어 못 봄) */}
          <div className={NOTICE_WRAP_CLASS}>
            {blockReason ? <p role="status" data-testid="purchase-block-reason" className={BLOCK_REASON_CLASS}>{blockReason}</p> : null}
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}
