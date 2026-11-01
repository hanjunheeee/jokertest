import {
  MSG_CLASS,
  META_CLASS,
} from "../../constants/nightTurn/ingameNightTurnAnnouncementLayout.js"
import { CLOSE_LABEL } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"
import InGameParchmentModalAnimated from "../parchment/InGameParchmentModalAnimated.jsx"

export default function InGameNightTurnAnnouncementOverlay({ open, announcement, onClose }) {
  if (!announcement) return null

  return (
    <InGameParchmentModalAnimated
      open={open}
      variantKey="nightTurn"
      onDismiss={onClose}
      confirmLabel={CLOSE_LABEL}
      parchmentProps={{ "data-night-turn-role": announcement.role }}
    >
      <p className={MSG_CLASS}>{announcement.message}</p>
      <p className={META_CLASS}>밤이 깊어갑니다</p>
    </InGameParchmentModalAnimated>
  )
}
