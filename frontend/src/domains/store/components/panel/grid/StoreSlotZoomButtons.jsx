// 상품 칸 옆 보조 버튼 (카드는 사망 모습 미리보기, 스킨은 전신 보기, 프로필 테두리는 크게 보기)
// StoreItemSlot이 칸 버튼 옆에 따로 붙여 씀, 누르면 클릭 번짐도 막음
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  getProfileBorderZoomItem,
  isPlayerCardStoreItem,
  isProfileBorderStoreItem,
  isSkinStoreItem,
} from "../../../constants/storeItems.js"
import { STORE_ASSETS } from "../../../../../shared/constants/storeAssets.js"
import {
  PREVIEW_TOGGLE_BTN_CLASS,
  PREVIEW_TOGGLE_IMG_CLASS,
} from "../../../constants/storeLayoutStyle.js"

// 상품 종류에 맞는 보조 버튼만 보임
export default function StoreSlotZoomButtons({
  item,
  name,
  previewDead,
  onToggleDeadPreview,
  onOpenSkinZoom,
  onOpenProfileBorderZoom,
}) {
  const showPreviewToggle = isPlayerCardStoreItem(item)
  const showSkinExpandButton = isSkinStoreItem(item)
  const showBorderExpandBtn = isProfileBorderStoreItem(item)

  return (
    <>
      {/* 카드: 사망 모습 미리보기 켜고 끄기 */}
      {showPreviewToggle ? (
        <button
          type="button"
          className={PREVIEW_TOGGLE_BTN_CLASS}
          style={{ outline: "none" }}
          aria-label={previewDead ? "생존 상태 미리보기" : "사망 상태 미리보기"}
          aria-pressed={previewDead}
          onClick={(event) => {
            event.stopPropagation()
            onToggleDeadPreview?.()
          }}
        >
          <PublicAsset
            src={STORE_ASSETS.previewToggleButton}
            alt=""
            className={PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}

      {/* 스킨: 전신 보기 창 열기 */}
      {showSkinExpandButton ? (
        <button
          type="button"
          className={PREVIEW_TOGGLE_BTN_CLASS}
          style={{ outline: "none" }}
          aria-label={`${name} 전신 보기`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenSkinZoom?.(item)
          }}
        >
          <PublicAsset
            src={STORE_ASSETS.expandPreviewButton}
            alt=""
            className={PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}

      {/* 프로필 테두리: 크게 보기 창 열기 */}
      {showBorderExpandBtn ? (
        <button
          type="button"
          className={PREVIEW_TOGGLE_BTN_CLASS}
          style={{ outline: "none" }}
          aria-label={`${name} 프로필 테두리 크게 보기`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenProfileBorderZoom?.(getProfileBorderZoomItem(item))
          }}
        >
          <PublicAsset
            src={STORE_ASSETS.expandPreviewButton}
            alt=""
            className={PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}
    </>
  )
}
