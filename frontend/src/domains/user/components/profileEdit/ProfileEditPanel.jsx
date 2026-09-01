import { STORE_ASSETS } from "@/domains/store/constants/storeAssets.js"
import {
  PROFILE_EDIT_CLOSE_BTN_CLASS,
  PROFILE_EDIT_CLOSE_BTN_IMG_CLASS,
  PROFILE_EDIT_HEADER_CLASS,
  PROFILE_EDIT_PANEL_CLASS,
} from "@/domains/user/constants/profileEditLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import ProfileEditConfirmButton from "./ProfileEditConfirmButton.jsx"
import ProfileEditOptionGrid from "./ProfileEditOptionGrid.jsx"
import ProfileEditPreview from "./ProfileEditPreview.jsx"
import ProfileEditTabs from "./ProfileEditTabs.jsx"

export default function ProfileEditPanel({
  activeTab,
  onTabChange,
  draftPhoto,
  draftFrame,
  onSelectPhoto,
  onSelectFrame,
  onClose,
  onConfirm,
}) {
  return (
    <div className={PROFILE_EDIT_PANEL_CLASS}>
      <button
        type="button"
        aria-label="프로필 수정 닫기"
        onClick={onClose}
        className={PROFILE_EDIT_CLOSE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={STORE_ASSETS.popupCloseButton}
          alt=""
          className={PROFILE_EDIT_CLOSE_BTN_IMG_CLASS}
        />
      </button>

      <header className={PROFILE_EDIT_HEADER_CLASS}>
        <ProfileEditTabs activeTab={activeTab} onTabChange={onTabChange} />
      </header>

      <ProfileEditPreview photoSrc={draftPhoto} frameSrc={draftFrame} />

      <ProfileEditOptionGrid
        activeTab={activeTab}
        selectedPhoto={draftPhoto}
        selectedFrame={draftFrame}
        onSelectPhoto={onSelectPhoto}
        onSelectFrame={onSelectFrame}
      />

      <ProfileEditConfirmButton onClick={onConfirm} />
    </div>
  )
}
