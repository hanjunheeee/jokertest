import {
  PROFILE_EDIT_GRID_CLASS,
  PROFILE_EDIT_GRID_SECTION_CLASS,
  PROFILE_EDIT_OPTION_BORDER_CLASS,
  PROFILE_EDIT_OPTION_BTN_CLASS,
  PROFILE_EDIT_OPTION_CARD_CLASS,
  PROFILE_EDIT_OPTION_CARD_SELECTED_CLASS,
  PROFILE_EDIT_OPTION_PHOTO_CLASS,
  PROFILE_EDIT_OPTION_PHOTO_WRAP_CLASS,
  PROFILE_EDIT_FREE_PHOTOS,
  PROFILE_EDIT_OWNED_BORDERS,
  PROFILE_EDIT_TAB_BORDER,
  PROFILE_EDIT_TAB_PHOTO,
} from "@/domains/user/constants/profileEditLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function ProfileEditOptionGrid({
  activeTab,
  selectedPhoto,
  selectedFrame,
  onSelectPhoto,
  onSelectFrame,
}) {
  const isPhotoTab = activeTab === PROFILE_EDIT_TAB_PHOTO
  const items = isPhotoTab ? PROFILE_EDIT_FREE_PHOTOS : PROFILE_EDIT_OWNED_BORDERS
  const selectedSrc = isPhotoTab ? selectedPhoto : selectedFrame
  const onSelect = isPhotoTab ? onSelectPhoto : onSelectFrame

  return (
    <section
      className={PROFILE_EDIT_GRID_SECTION_CLASS}
      aria-label={isPhotoTab ? "프로필 이미지 목록" : "프로필 테두리 목록"}
    >
      <div className={PROFILE_EDIT_GRID_CLASS}>
        {items.map((src) => {
          const selected = selectedSrc === src

          return (
            <button
              key={src}
              type="button"
              aria-pressed={selected}
              className={PROFILE_EDIT_OPTION_BTN_CLASS}
              style={{ outline: "none" }}
              onClick={() => onSelect(src)}
            >
              <div
                className={`${PROFILE_EDIT_OPTION_CARD_CLASS} ${selected ? PROFILE_EDIT_OPTION_CARD_SELECTED_CLASS : ""}`}
              >
                {isPhotoTab ? (
                  <div className={PROFILE_EDIT_OPTION_PHOTO_WRAP_CLASS}>
                    <PublicAsset src={src} alt="" className={PROFILE_EDIT_OPTION_PHOTO_CLASS} />
                  </div>
                ) : (
                  <PublicAsset src={src} alt="" className={PROFILE_EDIT_OPTION_BORDER_CLASS} />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
