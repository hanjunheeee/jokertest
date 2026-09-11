import {
  PROFILE_EDIT_GRID_CLASS,
  PROFILE_EDIT_GRID_RETRY_BTN_CLASS,
  PROFILE_EDIT_GRID_SECTION_CLASS,
  PROFILE_EDIT_GRID_STATUS_TEXT_CLASS,
  PROFILE_EDIT_OPTION_BORDER_CLASS,
  PROFILE_EDIT_OPTION_BTN_CLASS,
  PROFILE_EDIT_OPTION_CARD_CLASS,
  PROFILE_EDIT_OPTION_CARD_SELECTED_CLASS,
  PROFILE_EDIT_OPTION_PHOTO_CLASS,
  PROFILE_EDIT_OPTION_PHOTO_WRAP_CLASS,
  PROFILE_EDIT_FREE_PHOTOS,
  PROFILE_EDIT_TAB_PHOTO,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// F-12(AC-06) 재검토 대응: 테두리는 더 이상 정적 목록(PROFILE_EDIT_OWNED_BORDERS)이
// 아니다 — ownedBorderOptions(서버 entitlements에서 유도한 itemId+자산 목록)만 그린다.
// 로딩/오류/빈 소유 목록은 사진 탭과 무관하게 테두리 탭에서만 구분해 보여준다(사진은 항상
// 정적 무료 목록이라 서버 상태에 의존하지 않는다, A-11).
export default function ProfileEditOptionGrid({
  activeTab,
  selectedPhoto,
  onSelectPhoto,
  ownedBorderOptions,
  borderListStatus,
  selectedBorderItemId,
  onSelectBorder,
  onRetryLoadBorders,
}) {
  const isPhotoTab = activeTab === PROFILE_EDIT_TAB_PHOTO

  const renderBorderTabContent = () => {
    if (borderListStatus === "loading") {
      return <p className={PROFILE_EDIT_GRID_STATUS_TEXT_CLASS}>테두리 목록을 불러오는 중입니다…</p>
    }
    if (borderListStatus === "error") {
      return (
        <div className={PROFILE_EDIT_GRID_STATUS_TEXT_CLASS}>
          <p>테두리 목록을 불러오지 못했습니다.</p>
          <button type="button" className={PROFILE_EDIT_GRID_RETRY_BTN_CLASS} onClick={onRetryLoadBorders}>
            다시 시도
          </button>
        </div>
      )
    }
    if (borderListStatus === "empty") {
      return <p className={PROFILE_EDIT_GRID_STATUS_TEXT_CLASS}>보유한 테두리가 없습니다.</p>
    }

    return (
      <div className={PROFILE_EDIT_GRID_CLASS}>
        {ownedBorderOptions.map(({ itemId, src }) => {
          const selected = selectedBorderItemId === itemId

          return (
            <button
              key={itemId}
              type="button"
              aria-pressed={selected}
              className={PROFILE_EDIT_OPTION_BTN_CLASS}
              style={{ outline: "none" }}
              onClick={() => onSelectBorder(itemId)}
            >
              <div
                className={`${PROFILE_EDIT_OPTION_CARD_CLASS} ${selected ? PROFILE_EDIT_OPTION_CARD_SELECTED_CLASS : ""}`}
              >
                <PublicAsset src={src} alt="" className={PROFILE_EDIT_OPTION_BORDER_CLASS} />
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <section
      className={PROFILE_EDIT_GRID_SECTION_CLASS}
      aria-label={isPhotoTab ? "프로필 이미지 목록" : "프로필 테두리 목록"}
    >
      {isPhotoTab ? (
        <div className={PROFILE_EDIT_GRID_CLASS}>
          {PROFILE_EDIT_FREE_PHOTOS.map((src) => {
            const selected = selectedPhoto === src

            return (
              <button
                key={src}
                type="button"
                aria-pressed={selected}
                className={PROFILE_EDIT_OPTION_BTN_CLASS}
                style={{ outline: "none" }}
                onClick={() => onSelectPhoto(src)}
              >
                <div
                  className={`${PROFILE_EDIT_OPTION_CARD_CLASS} ${selected ? PROFILE_EDIT_OPTION_CARD_SELECTED_CLASS : ""}`}
                >
                  <div className={PROFILE_EDIT_OPTION_PHOTO_WRAP_CLASS}>
                    <PublicAsset src={src} alt="" className={PROFILE_EDIT_OPTION_PHOTO_CLASS} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        renderBorderTabContent()
      )}
    </section>
  )
}
