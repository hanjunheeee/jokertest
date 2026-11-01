import { SECTION_TITLE_CLASS } from "../../../../../domains/library/constants/invitedGuests/layoutStyle.js"

export default function InvitedGuestsSectionTitle({ children }) {
  return <h3 className={SECTION_TITLE_CLASS}>{children}</h3>
}