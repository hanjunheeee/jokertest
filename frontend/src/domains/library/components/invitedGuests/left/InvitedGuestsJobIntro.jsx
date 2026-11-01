import InvitedGuestsSectionTitle from "../../../../../domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import {
  INTRO_ROW_CLASS,
  INTRO_SECTION_CLASS,
  INTRO_TEXT_CLASS,
  INTRO_TEXT_STACK_CLASS,
  STANDING_IMG_CLASS,
  STANDING_IMG_WRAP_CLASS,
} from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"
import PublicAsset from "../../../../../shared/ui/PublicAsset"

function splitParagraphs(description = "") {
  return description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export default function InvitedGuestsJobIntro({
  description,
  standingImage,
  standingImageClass = STANDING_IMG_CLASS,
  standingImageWrapClass = STANDING_IMG_WRAP_CLASS,
}) {
  const paragraphs = splitParagraphs(description)

  return (
    <section className={INTRO_SECTION_CLASS}>
      <InvitedGuestsSectionTitle>직업 설명</InvitedGuestsSectionTitle>
      <div className={INTRO_ROW_CLASS}>
        <div className={INTRO_TEXT_STACK_CLASS}>
          {paragraphs.map((paragraph, index) => (
            <p key={index} className={INTRO_TEXT_CLASS}>
              {paragraph}
            </p>
          ))}
        </div>
        <div className={standingImageWrapClass}>
          <PublicAsset src={standingImage} alt="" className={standingImageClass} />
        </div>
      </div>
    </section>
  )
}