// 프로필 편집 창 안쪽 (닫기·탭·미리보기·보유 목록·오류·수정하기)
// ProfileEditOverlay가 씀
import { STORE_ASSETS } from "../../../../shared/constants/storeAssets.js"
import { PLAYER_PROFILE_ASSETS } from "../../../../shared/constants/playerProfileAssets.js"
import {
  CLOSE_BTN_CLASS,
  CLOSE_BTN_IMG_CLASS,
  ERROR_TEXT_CLASS,
  HEADER_CLASS,
  PANEL_CLASS,
  borderAssetSrcForItemId,
  photoAssetSrcForItemId,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"
import ProfileEditConfirmButton from "./ProfileEditConfirmButton.jsx"
import ProfileEditOptionGrid from "./ProfileEditOptionGrid.jsx"
import ProfileEditPreview from "./ProfileEditPreview.jsx"
import ProfileEditTabs from "./ProfileEditTabs.jsx"

// 초안 id를 그림으로 바꿔 미리보기, 못 찾으면 기본 그림
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
  const draftPhoto = photoAssetSrcForItemId(draftPhotoItemId) ?? PLAYER_PROFILE_ASSETS.defaultPhoto
  const draftFrame = borderAssetSrcForItemId(draftBorderItemId) ?? PLAYER_PROFILE_ASSETS.defaultBorder

  return (
    <div className={PANEL_CLASS}>
      <button
        type="button"
        aria-label="프로필 수정 닫기"
        data-sfx-owner="explicit"
        onClick={onClose}
        className={CLOSE_BTN_CLASS}
        style={{ outline: "none" }}
      >
        <PublicAsset
          src={STORE_ASSETS.popupCloseButton}
          alt=""
          className={CLOSE_BTN_IMG_CLASS}
        />
      </button>

      <header className={HEADER_CLASS}>
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

      {confirmError ? <p className={ERROR_TEXT_CLASS}>{confirmError}</p> : null}

      <ProfileEditConfirmButton onClick={onConfirm} disabled={confirmStatus === "saving"} />
    </div>
  )
}
