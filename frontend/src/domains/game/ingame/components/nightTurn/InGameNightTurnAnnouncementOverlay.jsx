// 파일 역할: InGameNightTurnAnnouncementOverlay.jsx - 밤 역할 턴 안내 화면입니다.
import {
  INGAME_NIGHT_TURN_MESSAGE_CLASS,
  INGAME_NIGHT_TURN_META_CLASS,
} from "../../constants/nightTurn/ingameNightTurnAnnouncementLayout.js"
import { INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"
import InGameParchmentModalAnimated from "../parchment/InGameParchmentModalAnimated.jsx"

/**
 * 밤 역할 턴 안내 — 전체 화면 파치먼트 오버레이.
 * 셸은 InGameParchmentModalAnimated, 본문은 역할 턴 문구만 채운다.
 */
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
