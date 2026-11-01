import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import { PLAYER_PROFILE_ASSETS } from "../../../../shared/constants/playerProfileAssets.js"
import {
  PROFILE_EDIT_CLOSE_BTN_CLASS,
  PROFILE_EDIT_CLOSE_BTN_IMG_CLASS,
  PROFILE_EDIT_ERROR_TEXT_CLASS,
  PROFILE_EDIT_HEADER_CLASS,
  PROFILE_EDIT_PANEL_CLASS,
  profileBorderAssetSrcForItemId,
  profilePhotoAssetSrcForItemId,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"
import ProfileEditConfirmButton from "./ProfileEditConfirmButton.jsx"
import ProfileEditOptionGrid from "./ProfileEditOptionGrid.jsx"
import ProfileEditPreview from "./ProfileEditPreview.jsx"
import ProfileEditTabs from "./ProfileEditTabs.jsx"

export default function ProfileEditPanel({
  activeTab,
  onTabChange,
  draftPhotoItemId,
  draftBorderItemId,
  ownedPhotoOptions,
  photoListStatus,
  onRetryLoadPhotos,
  ownedBorderOptions,
  borderListStatus,
  onRetryLoadBorders,
  onSelectPhoto,
  onSelectBorder,
  onClose,
  onConfirm,
  confirmStatus,
  confirmError,
}) {
  const draftPhoto = profilePhotoAssetSrcForItemId(draftPhotoItemId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto
  const draftFrame = profileBorderAssetSrcForItemId(draftBorderItemId) ?? PLAYER_PROFILE_ASSETS.defaultBorder

  return (
    <div className={PROFILE_EDIT_PANEL_CLASS}>
      <button
        type="button"
        aria-label="프로필 수정 닫기"
        data-sfx-owner="explicit"
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
        ownedPhotoOptions={ownedPhotoOptions}
        photoListStatus={photoListStatus}
        selectedPhotoItemId={draftPhotoItemId}
        onSelectPhoto={onSelectPhoto}
        onRetryLoadPhotos={onRetryLoadPhotos}
        ownedBorderOptions={ownedBorderOptions}
        borderListStatus={borderListStatus}
        selectedBorderItemId={draftBorderItemId}
        onSelectBorder={onSelectBorder}
        onRetryLoadBorders={onRetryLoadBorders}
      />

      {confirmError ? <p className={PROFILE_EDIT_ERROR_TEXT_CLASS}>{confirmError}</p> : null}

      <ProfileEditConfirmButton onClick={onConfirm} disabled={confirmStatus === "saving"} />
    </div>
  )
}
