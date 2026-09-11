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
  PROFILE_EDIT_PHOTO_OPTIONS,
  PROFILE_EDIT_TAB_PHOTO,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// F-12(AC-06)/F-13(AC-01) 재검토 대응: 테두리·사진 모두 정적 src 목록이 아니라
// {itemId, src} 목록이다 — 선택은 항상 itemId로 하고(서버에 저장할 값과 화면에 그릴 값을
// 하나로 묶는다), 테두리는 ownedBorderOptions(서버 entitlements에서 유도)를, 사진은
// PROFILE_EDIT_PHOTO_OPTIONS(현재 카탈로그 기준 16종 전부 기본 지급이라 정적 목록과
// 실제 소유 목록이 같다, A-07)를 그린다. 로딩/오류/빈 소유 목록은 테두리 탭에서만
// 구분해 보여준다.
export default function ProfileEditOptionGrid({
  activeTab,
  selectedPhotoItemId,
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
          {PROFILE_EDIT_PHOTO_OPTIONS.map(({ itemId, src }) => {
            const selected = selectedPhotoItemId === itemId

            return (
              <button
                key={itemId}
                type="button"
                aria-pressed={selected}
                className={PROFILE_EDIT_OPTION_BTN_CLASS}
                style={{ outline: "none" }}
                onClick={() => onSelectPhoto(itemId)}
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
