// 게임 시작 막힘 안내 창: 양피지 창에 제목·사유
// MatchingRoomPanelArea가 씀, 사유 문구가 있을 때만 뜸
import { useRef } from 'react'
import InGameParchmentModalBase from '@/domains/game/ingame/components/parchment/InGameParchmentModalBase.js'
import { PARCHMENT_CONFIRM_LABEL } from '@/domains/game/ingame/constants/parchment/ingameParchmentConfirmButton.js'
import {
  BLOCKED_MSG_CLASS,
  BLOCKED_TITLE,
  BLOCKED_TITLE_CLASS,
} from '../constants/gameStartMessages.js'

// 시작 막힘 안내 (확인 누르면 onClose로 문구 지움)
export default function GameStartBlockedModal({ message, onClose }) {
  const confirmButtonRef = useRef(null)

  // 사유 없으면 안 그림
  if (!message) return null

  return (
    <InGameParchmentModalBase
      variantKey="gameStartBlocked"
      onDismiss={onClose}
      confirmLabel={PARCHMENT_CONFIRM_LABEL}
      confirmButtonRef={confirmButtonRef}
      focusKey={message}
      wrapperProps={{ 'data-game-start-blocked': '' }}
    >
      <h2 className={BLOCKED_TITLE_CLASS}>
        {BLOCKED_TITLE}
      </h2>
      <p role="alert" className={BLOCKED_MSG_CLASS}>
        {message}
      </p>
    </InGameParchmentModalBase>
  )
}
