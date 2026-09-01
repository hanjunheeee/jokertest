import {
  PROFILE_EDIT_PREVIEW_FRAME_CLASS,
  PROFILE_EDIT_PREVIEW_PHOTO_CLASS,
  PROFILE_EDIT_PREVIEW_PHOTO_WRAP_CLASS,
  PROFILE_EDIT_PREVIEW_SECTION_CLASS,
  PROFILE_EDIT_PREVIEW_WRAP_CLASS,
} from "@/domains/user/constants/profileEditLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function ProfileEditPreview({ photoSrc, frameSrc }) {
  return (
    <section className={PROFILE_EDIT_PREVIEW_SECTION_CLASS} aria-label="프로필 미리보기">
      <div className={PROFILE_EDIT_PREVIEW_WRAP_CLASS}>
        <div className={PROFILE_EDIT_PREVIEW_PHOTO_WRAP_CLASS}>
          <PublicAsset src={photoSrc} alt="" className={PROFILE_EDIT_PREVIEW_PHOTO_CLASS} />
        </div>
        <PublicAsset src={frameSrc} alt="" className={PROFILE_EDIT_PREVIEW_FRAME_CLASS} />
      </div>
    </section>
  )
}
