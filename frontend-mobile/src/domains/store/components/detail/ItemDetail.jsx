// 고른 상품 설명 칸 (그림·이름·태그·분류·등급·가격·구매 버튼), 상품 칸 목록 아래 늘 보임
// panel/StorePanel이 고른 상품이 있을 때 씀 (데스크톱 StoreSelectedItemDetail 자리)
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import {
    DETAIL_IMG_CLASS,
    DETAIL_IMG_WRAP_CLASS,
    DETAIL_META_DIVIDER_CLASS,
    DETAIL_NAME_ROW_CLASS,
    DETAIL_PRICE_ROW_CLASS,
    STORE_DETAIL_INFO_CLASS,
    STORE_DETAIL_META_CLASS,
    STORE_DETAIL_NAME_CLASS,
    STORE_DETAIL_ROW_CLASS,
    STORE_DETAIL_TAG_CLASS,
} from "@/domains/store/constants/storeLayoutStyle.js"
import DetailPrice from "./DetailPrice.jsx"
import PurchaseButton from "./PurchaseButton.jsx"

// 칸 바탕은 데스크톱 DETAIL_SECTION_CLASS 색·그림자, 바깥 여백만 폰 판에 맞춤 (그 상수는 데스크톱 틀 여백이 들어 있음)
const SECTION_CLASS =
    "mt-2 shrink-0 rounded-md bg-[#1a0f0a]/22 px-2 py-1.5 [box-shadow:inset_0_1px_0_rgba(245,240,230,0.10),_0_6px_18px_rgba(0,0,0,0.16)]"

// 보유 표시·버튼 글자·잠금은 부르는 쪽이 데스크톱 StorePanel과 같은 식으로 계산해 넘김
export default function ItemDetail({ item, displayIcon, onPurchaseClick, purchaseDisabled = false, purchaseLabel = null, owned = false }) {
    return (
        <section className={SECTION_CLASS} aria-label="선택한 아이템 정보">
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
                        <DetailPrice item={item} />
                        <PurchaseButton onClick={onPurchaseClick} disabled={purchaseDisabled} owned={owned} label={purchaseLabel} className="ml-auto w-28" />
                    </div>
                </div>
            </div>
        </section>
    )
}
