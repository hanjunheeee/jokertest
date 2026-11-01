// 프로필 편집 미리보기 (둥근 사진 + 테두리 겹침)
// ProfileEditSheet가 씀
import {
  PREVIEW_FRAME_CLASS,
  PREVIEW_PHOTO_CLASS,
  PREVIEW_PHOTO_WRAP_CLASS,
  PREVIEW_WRAP_CLASS,
} from "@/domains/user/constants/profileEditLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 사진은 둥근 칸 안, 테두리는 위에 겹침 (크기·비율은 데스크톱 ProfileEditPreview 상수), 폰 가로는 아래 선 없음
export default function Preview({ photoSrc, frameSrc }) {
  return (
    <section
      aria-label="프로필 미리보기"
      className="flex shrink-0 items-center justify-center border-b border-[#2a1810]/12 px-4 py-4 land:border-b-0 land:py-2"
    >
      <div className={PREVIEW_WRAP_CLASS}>
        <div className={PREVIEW_PHOTO_WRAP_CLASS}>
          <PublicAsset src={photoSrc} alt="" className={PREVIEW_PHOTO_CLASS} />
        </div>
        <PublicAsset src={frameSrc} alt="" className={PREVIEW_FRAME_CLASS} />
      </div>
    </section>
  )
}
