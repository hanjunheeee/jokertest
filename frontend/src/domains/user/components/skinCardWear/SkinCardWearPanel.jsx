import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import {
  SKIN_CARD_WEAR_CLOSE_BTN_CLASS,
  SKIN_CARD_WEAR_CLOSE_BTN_IMG_CLASS,
  SKIN_CARD_WEAR_CONFIRM_BTN_CLASS,
  SKIN_CARD_WEAR_CONFIRM_BTN_IMAGE_CLASS,
  SKIN_CARD_WEAR_CONFIRM_BTN_LABEL_CLASS,
  SKIN_CARD_WEAR_CONFIRM_WRAP_CLASS,
  SKIN_CARD_WEAR_PANEL_CLASS,
  SKIN_CARD_WEAR_PANEL_CONTENT_CLASS,
  SKIN_CARD_WEAR_PANEL_FRAME_CLASS,
  SKIN_CARD_WEAR_PANEL_GRID_CLASS,
  SKIN_CARD_WEAR_PANEL_INNER_PAD,
  SKIN_CARD_WEAR_PANEL_STACK_CLASS,
  SKIN_CARD_WEAR_LIST_TITLE_ANCHOR_CLASS,
  SKIN_CARD_WEAR_LIST_TITLE_CLASS,
} from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import SkinCardWearJobTabs from "./SkinCardWearJobTabs.jsx"
import SkinCardWearList from "./SkinCardWearList.jsx"
import SkinCardWearPreview from "./SkinCardWearPreview.jsx"

export default function SkinCardWearPanel({
  listItems,
  selectedItemId,
  appliedSkinsByJob,
  appliedCardFrameId,
  onSelectItem,
  jobTabs,
  activeJobIndex,
  onJobSelect,
  preview,
  previewMode,
  onTogglePreviewMode,
  onClose,
  onConfirm,
}) {
  return (
    <div className={SKIN_CARD_WEAR_PANEL_STACK_CLASS}>
      <div className={SKIN_CARD_WEAR_PANEL_CLASS}>
        <PublicAsset
          src={SKIN_CARD_WEAR_ASSETS.popupFrame}
          alt=""
          className={SKIN_CARD_WEAR_PANEL_FRAME_CLASS}
        />

        <h2 className={`${SKIN_CARD_WEAR_LIST_TITLE_ANCHOR_CLASS} ${SKIN_CARD_WEAR_LIST_TITLE_CLASS}`}>
          스킨&카드 목록
        </h2>

        <button
          type="button"
          aria-label="스킨&카드 착용 닫기"
          onClick={onClose}
          className={SKIN_CARD_WEAR_CLOSE_BTN_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={SKIN_CARD_WEAR_ASSETS.popupCloseButton}
            alt=""
            className={SKIN_CARD_WEAR_CLOSE_BTN_IMG_CLASS}
          />
        </button>

        <div className={SKIN_CARD_WEAR_PANEL_CONTENT_CLASS} style={SKIN_CARD_WEAR_PANEL_INNER_PAD}>
          <SkinCardWearJobTabs
            tabs={jobTabs}
            activeIndex={activeJobIndex}
            onSelect={onJobSelect}
          />

          <div className={SKIN_CARD_WEAR_PANEL_GRID_CLASS}>
            <SkinCardWearList
              items={listItems}
              selectedItemId={selectedItemId}
              appliedSkinsByJob={appliedSkinsByJob}
              appliedCardFrameId={appliedCardFrameId}
              onSelectItem={onSelectItem}
            />

            <SkinCardWearPreview
              preview={preview}
              previewMode={previewMode}
              onTogglePreviewMode={onTogglePreviewMode}
            />
          </div>
        </div>
      </div>

      <div className={SKIN_CARD_WEAR_CONFIRM_WRAP_CLASS}>
        <button
          type="button"
          onClick={onConfirm}
          className={SKIN_CARD_WEAR_CONFIRM_BTN_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={SKIN_CARD_WEAR_ASSETS.confirmButton}
            alt=""
            className={SKIN_CARD_WEAR_CONFIRM_BTN_IMAGE_CLASS}
          />
          <span className={SKIN_CARD_WEAR_CONFIRM_BTN_LABEL_CLASS}>적용</span>
        </button>
      </div>
    </div>
  )
}
