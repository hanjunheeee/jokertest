import { INVITED_GUESTS_SECTION_TITLE_CLASS } from "@/domains/library/constants/invitedGuests/layoutStyle.js"

export default function InvitedGuestsSectionTitle({ children }) {
  return <h3 className={INVITED_GUESTS_SECTION_TITLE_CLASS}>{children}</h3>
}
