import { SKIN_CARD_WEAR_ASSETS } from "../../constants/skinCardWear/skinCardWearAssets.js"
import {
  CLOSE_BTN_CLASS,
  CLOSE_BTN_IMG_CLASS,
  CONFIRM_BTN_CLASS,
  CONFIRM_BTN_IMG_CLASS,
  CONFIRM_BTN_LABEL_CLASS,
  CONFIRM_WRAP_CLASS,
  PANEL_CLASS,
  PANEL_CONTENT_CLASS,
  PANEL_FRAME_CLASS,
  PANEL_GRID_CLASS,
  PANEL_INNER_PAD,
  PANEL_STACK_CLASS,
  LIST_TITLE_ANCHOR_CLASS,
  LIST_TITLE_CLASS,
} from "../../constants/skinCardWear/skinCardWearLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"
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
  confirmStatus = "idle",
  confirmError = null,
}) {
  const isSaving = confirmStatus === "saving"
  const hasFailed = confirmStatus === "error" || confirmStatus === "uncertain"

  return (
    <div className={PANEL_STACK_CLASS}>
      <div className={PANEL_CLASS}>
        <PublicAsset
          src={SKIN_CARD_WEAR_ASSETS.popupFrame}
          alt=""
          className={PANEL_FRAME_CLASS}
        />

        <h2 className={`${LIST_TITLE_ANCHOR_CLASS} ${LIST_TITLE_CLASS}`}>
          스킨&카드 목록
        </h2>

        <button
          type="button"
          aria-label="스킨&카드 착용 닫기"
          data-sfx-owner="explicit"
          onClick={onClose}
          className={CLOSE_BTN_CLASS}
          style={{ outline: "none" }}
        >
          <PublicAsset
            src={SKIN_CARD_WEAR_ASSETS.popupCloseButton}
            alt=""
            className={CLOSE_BTN_IMG_CLASS}
          />
        </button>

        <div className={PANEL_CONTENT_CLASS} style={PANEL_INNER_PAD} inert={isSaving} aria-disabled={isSaving}>
          <SkinCardWearJobTabs
            tabs={jobTabs}
            activeIndex={activeJobIndex}
            onSelect={onJobSelect}
          />

          <div className={PANEL_GRID_CLASS}>
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

      <div className={CONFIRM_WRAP_CLASS}>
        {hasFailed ? (
          <p role="alert" aria-live="assertive" style={{ color: "#ff6b6b", margin: 0 }}>
            {confirmError}
          </p>
        ) : null}
        <button
          type="button"
          data-sfx-owner="explicit"
          onClick={onConfirm}
          disabled={isSaving}
          aria-busy={isSaving}
          className={CONFIRM_BTN_CLASS}
          style={{ outline: "none", opacity: isSaving ? 0.6 : 1, cursor: isSaving ? "not-allowed" : "pointer" }}
        >
          <PublicAsset
            src={SKIN_CARD_WEAR_ASSETS.confirmButton}
            alt=""
            className={CONFIRM_BTN_IMG_CLASS}
          />
          <span className={CONFIRM_BTN_LABEL_CLASS}>
            {isSaving ? "저장 중..." : hasFailed ? "다시 시도" : "적용"}
          </span>
        </button>
      </div>
    </div>
  )
}
