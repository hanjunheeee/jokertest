import InvitedGuestsSectionTitle from "@/domains/library/components/invitedGuests/shared/InvitedGuestsSectionTitle.jsx"
import {
  INVITED_GUESTS_INTRO_ROW_CLASS,
  INVITED_GUESTS_INTRO_SECTION_CLASS,
  INVITED_GUESTS_INTRO_TEXT_CLASS,
  INVITED_GUESTS_INTRO_TEXT_STACK_CLASS,
  INVITED_GUESTS_STANDING_IMAGE_CLASS,
  INVITED_GUESTS_STANDING_IMAGE_WRAP_CLASS,
} from "@/domains/library/constants/invitedGuests/layoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset"

function splitDescriptionParagraphs(description = "") {
  return description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

export default function InvitedGuestsJobIntro({
  description,
  standingImage,
  standingImageClass = INVITED_GUESTS_STANDING_IMAGE_CLASS,
  standingImageWrapClass = INVITED_GUESTS_STANDING_IMAGE_WRAP_CLASS,
}) {
  const paragraphs = splitDescriptionParagraphs(description)

  return (
    <section className={INVITED_GUESTS_INTRO_SECTION_CLASS}>
      <InvitedGuestsSectionTitle>직업 설명</InvitedGuestsSectionTitle>
      <div className={INVITED_GUESTS_INTRO_ROW_CLASS}>
        <div className={INVITED_GUESTS_INTRO_TEXT_STACK_CLASS}>
          {paragraphs.map((paragraph, index) => (
            <p key={index} className={INVITED_GUESTS_INTRO_TEXT_CLASS}>
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
