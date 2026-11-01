// 프로필 편집 보유 목록 칸 (탭에 맞는 사진·테두리 목록, 준비 안 됐으면 상태 글)
// ProfileEditSheet가 씀
import OptionStatus from "@m/domains/user/components/profileEdit/OptionStatus.jsx"
import { PROFILE_EDIT_TAB_PHOTO } from "@/domains/user/constants/profileEditLayout.js"
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

// 폰 4열·태블릿 6열, 고른 칸은 붉은 테두리, 사진은 둥근 틀 안
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
        <div className="grid grid-cols-4 gap-2 md:grid-cols-6">
          {options.map(({ itemId, src }) => {
            const selected = selectedId === itemId
            return (
              <button
                key={itemId}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(itemId)}
                className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-[#1a0f0a]/[0.06] p-0 shadow-[0_4px_14px_rgba(0,0,0,0.12)] ${
                  selected
                    ? "border-[#b83232]/55 ring-2 ring-[#c43c3c]/60 shadow-[0_0_16px_rgba(180,40,40,0.38)]"
                    : "border-[#2a1810]/14"
                }`}
              >
                {isPhoto ? (
                  <span className="flex h-[82%] w-[82%] items-center justify-center overflow-hidden rounded-full">
                    <PublicAsset src={src} alt="" className="block h-full w-full scale-[1.22] select-none object-cover object-center" />
                  </span>
                ) : (
                  <PublicAsset src={src} alt="" className="block h-[88%] w-[88%] select-none object-contain" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
