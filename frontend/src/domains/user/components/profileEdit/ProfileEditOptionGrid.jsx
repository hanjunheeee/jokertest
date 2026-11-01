import {
  PROFILE_EDIT_GRID_CLASS,
  GRID_RETRY_BTN_CLASS,
  GRID_SECTION_CLASS,
  GRID_STATUS_TEXT_CLASS,
  OPTION_BORDER_CLASS,
  OPTION_BTN_CLASS,
  OPTION_CARD_CLASS,
  OPTION_CARD_SELECTED_CLASS,
  OPTION_PHOTO_CLASS,
  OPTION_PHOTO_WRAP_CLASS,
  PROFILE_EDIT_TAB_PHOTO,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

function OptionGridStatus({ status, onRetry, loadingText, errorText, emptyText }) {
  if (status === "loading") {
    return <p className={GRID_STATUS_TEXT_CLASS}>{loadingText}</p>
  }
  if (status === "error") {
    return (
      <div className={GRID_STATUS_TEXT_CLASS}>
        <p>{errorText}</p>
        <button type="button" className={GRID_RETRY_BTN_CLASS} onClick={onRetry}>
          다시 시도
        </button>
      </div>
    )
  }
  return <p className={GRID_STATUS_TEXT_CLASS}>{emptyText}</p>
}

function OptionGrid({ options, selectedItemId, onSelect, photo }) {
  return (
    <div className={PROFILE_EDIT_GRID_CLASS}>
      {options.map(({ itemId, src }) => {
        const selected = selectedItemId === itemId

        return (
          <button
            key={itemId}
            type="button"
            aria-pressed={selected}
            className={OPTION_BTN_CLASS}
            style={{ outline: "none" }}
            onClick={() => onSelect(itemId)}
          >
            <div
              className={`${OPTION_CARD_CLASS} ${selected ? OPTION_CARD_SELECTED_CLASS : ""}`}
            >
              {photo ? (
                <div className={OPTION_PHOTO_WRAP_CLASS}>
                  <PublicAsset src={src} alt="" className={OPTION_PHOTO_CLASS} />
                </div>
              ) : (
                <PublicAsset src={src} alt="" className={OPTION_BORDER_CLASS} />
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function ProfileEditOptionGrid({
  activeTab,
  ownedPhotoOptions,
  photoListStatus,
  selectedPhotoItemId,
  onSelectPhoto,
  onRetryLoadPhotos,
  ownedBorderOptions,
  borderListStatus,
  selectedBorderItemId,
  onSelectBorder,
  onRetryLoadBorders,
}) {
  const isPhotoTab = activeTab === PROFILE_EDIT_TAB_PHOTO

  return (
    <section
      className={GRID_SECTION_CLASS}
      aria-label={isPhotoTab ? "프로필 이미지 목록" : "프로필 테두리 목록"}
    >
      {isPhotoTab ? (
        photoListStatus === "ready" ? (
          <OptionGrid options={ownedPhotoOptions} selectedItemId={selectedPhotoItemId} onSelect={onSelectPhoto} photo />
        ) : (
          <OptionGridStatus
            status={photoListStatus}
            onRetry={onRetryLoadPhotos}
            loadingText="프로필 이미지 목록을 불러오는 중입니다…"
            errorText="프로필 이미지 목록을 불러오지 못했습니다."
            emptyText="보유한 프로필 이미지가 없습니다."
          />
        )
      ) : borderListStatus === "ready" ? (
        <OptionGrid options={ownedBorderOptions} selectedItemId={selectedBorderItemId} onSelect={onSelectBorder} />
      ) : (
        <OptionGridStatus
          status={borderListStatus}
          onRetry={onRetryLoadBorders}
          loadingText="테두리 목록을 불러오는 중입니다…"
          errorText="테두리 목록을 불러오지 못했습니다."
          emptyText="보유한 테두리가 없습니다."
        />
      )}
    </section>
  )
}
