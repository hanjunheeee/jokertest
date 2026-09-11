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
  PROFILE_EDIT_TAB_PHOTO,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// F-13 AC-03 재검토(CODEX-5) — 사진도 테두리와 같은 계약이다: 둘 다 {itemId, src} 목록이고
// 선택은 항상 itemId로 하며(서버에 저장할 값과 화면에 그릴 값을 하나로 묶는다), 두 목록
// 모두 정적 배열이 아니라 useProfileBorderEditor.js가 entitlements에서 유도한 실제 소유
// 목록(ownedPhotoOptions/ownedBorderOptions)이다 — 지금 카탈로그의 사진 16종은 전부 기본
// 지급이라 결과가 같아 보이지만, 앞으로 구매·업적 전용 사진이 추가돼도(A-07) 이 컴포넌트는
// 손댈 필요가 없다. 로딩/오류/빈 소유 목록은 두 탭 모두 같은 규칙으로 보여준다.
function OptionGridStatus({ status, onRetry, loadingText, errorText, emptyText }) {
  if (status === "loading") {
    return <p className={PROFILE_EDIT_GRID_STATUS_TEXT_CLASS}>{loadingText}</p>
  }
  if (status === "error") {
    return (
      <div className={PROFILE_EDIT_GRID_STATUS_TEXT_CLASS}>
        <p>{errorText}</p>
        <button type="button" className={PROFILE_EDIT_GRID_RETRY_BTN_CLASS} onClick={onRetry}>
          다시 시도
        </button>
      </div>
    )
  }
  return <p className={PROFILE_EDIT_GRID_STATUS_TEXT_CLASS}>{emptyText}</p>
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
            className={PROFILE_EDIT_OPTION_BTN_CLASS}
            style={{ outline: "none" }}
            onClick={() => onSelect(itemId)}
          >
            <div
              className={`${PROFILE_EDIT_OPTION_CARD_CLASS} ${selected ? PROFILE_EDIT_OPTION_CARD_SELECTED_CLASS : ""}`}
            >
              {photo ? (
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
      className={PROFILE_EDIT_GRID_SECTION_CLASS}
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
