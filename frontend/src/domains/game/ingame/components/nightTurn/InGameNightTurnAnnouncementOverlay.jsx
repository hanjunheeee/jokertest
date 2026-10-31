import {
  INGAME_NIGHT_TURN_MESSAGE_CLASS,
  INGAME_NIGHT_TURN_META_CLASS,
} from "../../constants/nightTurn/ingameNightTurnAnnouncementLayout.js"
import { INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"
import InGameParchmentModalAnimated from "../parchment/InGameParchmentModalAnimated.jsx"

export default function InGameNightTurnAnnouncementOverlay({ open, announcement, onClose }) {
  if (!announcement) return null

  return (
    <InGameParchmentModalAnimated
      open={open}
      variantKey="nightTurn"
      onDismiss={onClose}
      confirmLabel={INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL}
      parchmentProps={{ "data-night-turn-role": announcement.role }}
    >
      <p className={INGAME_NIGHT_TURN_MESSAGE_CLASS}>{announcement.message}</p>
      <p className={INGAME_NIGHT_TURN_META_CLASS}>밤이 깊어갑니다</p>
    </InGameParchmentModalAnimated>
  )
}
