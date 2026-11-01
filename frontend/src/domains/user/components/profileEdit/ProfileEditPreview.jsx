// 프로필 편집 미리보기 (사진 + 테두리 겹침)
// ProfileEditPanel이 씀
import {
  PREVIEW_FRAME_CLASS,
  PREVIEW_PHOTO_CLASS,
  PREVIEW_PHOTO_WRAP_CLASS,
  PREVIEW_SECTION_CLASS,
  PREVIEW_WRAP_CLASS,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

// 사진은 둥근 칸 안, 테두리는 위에 겹침
export default function ProfileEditPreview({ photoSrc, frameSrc }) {
  return (
    <section className={PREVIEW_SECTION_CLASS} aria-label="프로필 미리보기">
      <div className={PREVIEW_WRAP_CLASS}>
        <div className={PREVIEW_PHOTO_WRAP_CLASS}>
          <PublicAsset src={photoSrc} alt="" className={PREVIEW_PHOTO_CLASS} />
        </div>
        <PublicAsset src={frameSrc} alt="" className={PREVIEW_FRAME_CLASS} />
      </div>
    </section>
  )
}
