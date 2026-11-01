// 프로필 편집 보유 목록 칸 (탭에 맞는 사진·테두리 목록, 준비 안 됐으면 상태 글)
// ProfileEditSheet가 씀
import OptionStatus from "@m/domains/user/components/profileEdit/OptionStatus.jsx"
import {
  OPTION_BORDER_CLASS,
  OPTION_BTN_CLASS,
  OPTION_CARD_CLASS,
  OPTION_CARD_SELECTED_CLASS,
  OPTION_PHOTO_CLASS,
  OPTION_PHOTO_WRAP_CLASS,
  PROFILE_EDIT_GRID_CLASS,
  PROFILE_EDIT_TAB_PHOTO,
} from "@/domains/user/constants/profileEditLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 탭별 상태 글 (데스크톱 문구 그대로)
const TEXTS = {
  photo: {
    loadingText: "프로필 이미지 목록을 불러오는 중입니다…",
    errorText: "프로필 이미지 목록을 불러오지 못했습니다.",
    emptyText: "보유한 프로필 이미지가 없습니다.",
  },
  border: {
    loadingText: "테두리 목록을 불러오는 중입니다…",
    errorText: "테두리 목록을 불러오지 못했습니다.",
    emptyText: "보유한 테두리가 없습니다.",
  },
}

// 칸 배치·모양은 데스크톱 상수 그대로(폭 따라 열 수 자동, 칸 60px 이상), 고른 칸은 붉은 테두리, 사진은 둥근 틀 안
export default function OptionGrid({ editor }) {
  const isPhoto = editor.activeTab === PROFILE_EDIT_TAB_PHOTO
  const status = isPhoto ? editor.photoListStatus : editor.borderListStatus
  const options = isPhoto ? editor.ownedPhotoOptions : editor.ownedBorderOptions
  const selectedId = isPhoto ? editor.draftPhotoItemId : editor.draftBorderItemId
  const onSelect = isPhoto ? editor.setDraftPhotoItemId : editor.setDraftBorderItemId
  const onRetry = isPhoto ? editor.retryLoadPhotos : editor.retryLoadBorders

  return (
    <section
      aria-label={isPhoto ? "프로필 이미지 목록" : "프로필 테두리 목록"}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
    >
      {status !== "ready" ? (
        <OptionStatus status={status} onRetry={onRetry} {...TEXTS[isPhoto ? "photo" : "border"]} />
      ) : (
        <div className={PROFILE_EDIT_GRID_CLASS}>
          {options.map(({ itemId, src }) => {
            const selected = selectedId === itemId
            return (
              <button
                key={itemId}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(itemId)}
                className={OPTION_BTN_CLASS}
                style={{ outline: "none" }}
              >
                <div className={`${OPTION_CARD_CLASS} ${selected ? OPTION_CARD_SELECTED_CLASS : ""}`}>
                  {isPhoto ? (
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
      )}
    </section>
  )
}
