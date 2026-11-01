import {
  PREVIEW_FRAME_CLASS,
  PREVIEW_PHOTO_CLASS,
  PREVIEW_PHOTO_WRAP_CLASS,
  PREVIEW_SECTION_CLASS,
  PREVIEW_WRAP_CLASS,
} from "../../constants/profileEditLayout.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

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
