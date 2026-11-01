// 상품 칸 위 줄 (스킨 안내 문구 또는 빈칸 + 일괄구매 켜기 버튼)
// StoreItemGrid가 상품이 있고 일괄구매를 보일 때 씀
import PublicAsset from "@/shared/ui/PublicAsset"
import { STORE_SKIN_CATEGORY_NOTICE } from "../../../constants/storeNotices.js"
import { STORE_ASSETS } from "../../../constants/storeAssets.js"
import {
  STORE_BULK_BTN_CLASS,
  STORE_BULK_BTN_IMAGE_CLASS,
  STORE_BULK_BTN_LABEL_CLASS,
  STORE_BULK_BTN_WRAP_CLASS,
  STORE_SKIN_NOTICE_CLASS,
  STORE_SKIN_NOTICE_ICON_CLASS,
  STORE_SKIN_NOTICE_TEXT_CLASS,
} from "../../../constants/storeLayoutStyle.js"

// 안내 문구가 없을 때도 빈칸을 둬서 버튼을 오른쪽에 붙임
export default function StoreGridToolbar({ showSkinNotice, active, onToggle }) {
  return (
    <div className={STORE_BULK_BTN_WRAP_CLASS}>
      {showSkinNotice ? (
        <p className={STORE_SKIN_NOTICE_CLASS}>
          <PublicAsset
            src={STORE_ASSETS.warningIcon}
            alt=""
            className={STORE_SKIN_NOTICE_ICON_CLASS}
          />
          <span className={STORE_SKIN_NOTICE_TEXT_CLASS}>{STORE_SKIN_CATEGORY_NOTICE}</span>
        </p>
      ) : (
        <span aria-hidden="true" className="min-w-0 flex-1" />
      )}
      <button
        type="button"
        className={`${STORE_BULK_BTN_CLASS} hover:opacity-90`}
        style={{ outline: "none" }}
        aria-pressed={active}
        onClick={onToggle}
      >
        <PublicAsset
          src={active ? STORE_ASSETS.purchaseButton : STORE_ASSETS.inactiveButton}
          alt=""
          className={STORE_BULK_BTN_IMAGE_CLASS}
        />
        <span className={STORE_BULK_BTN_LABEL_CLASS}>일괄구매</span>
      </button>
    </div>
  )
}
