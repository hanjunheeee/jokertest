// 상품 칸 옆 보조 버튼 (카드는 사망 모습 미리보기, 스킨은 전신 보기, 프로필 테두리는 크게 보기)
// StoreItemSlot이 씀, 누르면 칸 선택까지 번지지 않게 막음
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  getStoreProfileBorderZoomItem,
  isPlayerCardStoreItem,
  isProfileBorderStoreItem,
  isSkinStoreItem,
} from "../../../constants/storeItems.js"
import { STORE_ASSETS } from "../../../constants/storeAssets.js"
import {
  STORE_PREVIEW_TOGGLE_BTN_CLASS,
  STORE_PREVIEW_TOGGLE_IMG_CLASS,
} from "../../../constants/storeLayoutStyle.js"

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
  const showProfileBorderExpandButton = isProfileBorderStoreItem(item)

  return (
    <>
      {showPreviewToggle ? (
        <button
          type="button"
          className={STORE_PREVIEW_TOGGLE_BTN_CLASS}
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
            className={STORE_PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}

      {showSkinExpandButton ? (
        <button
          type="button"
          className={STORE_PREVIEW_TOGGLE_BTN_CLASS}
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
            className={STORE_PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}

      {showProfileBorderExpandButton ? (
        <button
          type="button"
          className={STORE_PREVIEW_TOGGLE_BTN_CLASS}
          style={{ outline: "none" }}
          aria-label={`${name} 프로필 테두리 크게 보기`}
          onClick={(event) => {
            event.stopPropagation()
            onOpenProfileBorderZoom?.(getStoreProfileBorderZoomItem(item))
          }}
        >
          <PublicAsset
            src={STORE_ASSETS.expandPreviewButton}
            alt=""
            className={STORE_PREVIEW_TOGGLE_IMG_CLASS}
          />
        </button>
      ) : null}
    </>
  )
}
