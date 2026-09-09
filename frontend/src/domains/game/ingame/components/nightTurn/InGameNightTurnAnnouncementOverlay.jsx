// 파일 역할: InGameNightTurnAnnouncementOverlay.jsx - 밤 역할 턴 안내 화면입니다.
import {
  INGAME_NIGHT_TURN_MESSAGE_CLASS,
  INGAME_NIGHT_TURN_META_CLASS,
} from "../../constants/nightTurn/ingameNightTurnAnnouncementLayout.js"
import { INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL } from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"
import InGameParchmentModalAnimated from "../parchment/InGameParchmentModalAnimated.jsx"

/**
 * 밤 역할 턴 안내 — 전체 화면 파치먼트 오버레이.
 *
 * 셸(backdrop·양피지·확인 버튼·Escape 닫기)은 InGameParchmentModalAnimated가 담당하고,
 * 이 파일은 역할 턴 문구만 채운다.
 *
 * 표시 전용이다: 역할 공개 확인(acknowledge_role_reveal)을 포함해 어떤 소켓 emit도 하지
 * 않고, 닫아도 서버의 역할 턴·phase는 움직이지 않는다(useInGameNightTurnAnnouncement 참고).
 * 닫기는 지금 떠 있는 이 안내를 닫기만 한다 — 다음 역할 턴을 열지 않는다. 다음 안내는
 * canonical 역할 턴이 실제로 바뀌었을 때만 뜬다.
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
