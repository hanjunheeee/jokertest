// 직업 설명 묶음 (설명 문단 + 직업 서 있는 그림)
// invitedGuests/InvitedGuestsSpread.jsx가 씀
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

// 빈 줄 기준으로 문단 나눔, 빈 문단 버림
function splitParagraphs(description = "") {
  return description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

// 직업마다 그림 크기·위치 className 따로 받음, 안 주면 기본 모양
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