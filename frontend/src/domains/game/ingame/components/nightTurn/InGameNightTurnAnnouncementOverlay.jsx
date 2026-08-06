// 파일 역할: InGameNightTurnAnnouncementOverlay.jsx - 밤 역할 턴 안내 화면입니다.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect } from "react"
import {
  INGAME_NIGHT_TURN_BACKDROP_CLASS,
  INGAME_NIGHT_TURN_CLOSE_BUTTON_CLASS,
  INGAME_NIGHT_TURN_MESSAGE_CLASS,
  INGAME_NIGHT_TURN_META_CLASS,
  INGAME_NIGHT_TURN_PANEL_CLASS,
  INGAME_NIGHT_TURN_PANEL_WRAP_CLASS,
} from "../../constants/nightTurn/ingameNightTurnAnnouncementLayout.js"
import {
  INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL,
} from "../../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_ROLE_REVEAL_PANEL_REDUCED_TRANSITION,
  INGAME_ROLE_REVEAL_PANEL_TRANSITION,
} from "../../constants/roleReveal/ingameRoleRevealLayout.js"
import InGameParchmentPanel from "../parchment/InGameParchmentPanel.jsx"

/**
 * 밤 역할 턴 안내 — 전체 화면 파치먼트 오버레이.
 *
 * 표시 전용이다: 역할 공개 확인(acknowledge_role_reveal)을 포함해 어떤 소켓 emit도 하지
 * 않고, 닫아도 서버의 역할 턴·phase는 움직이지 않는다(useInGameNightTurnAnnouncement 참고).
 * 닫기는 지금 떠 있는 이 안내를 닫기만 한다 — 다음 역할 턴을 열지 않는다. 다음 안내는
 * canonical 역할 턴이 실제로 바뀌었을 때만 뜬다.
 */
export default function InGameNightTurnAnnouncementOverlay({ open, announcement, onClose }) {
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!announcement) return null

  const transition = prefersReducedMotion
    ? INGAME_ROLE_REVEAL_PANEL_REDUCED_TRANSITION
    : INGAME_ROLE_REVEAL_PANEL_TRANSITION

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="밤 안내 닫기"
            className={INGAME_NIGHT_TURN_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
          />

          <div className={INGAME_NIGHT_TURN_PANEL_WRAP_CLASS}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="밤 역할 안내"
              className={INGAME_NIGHT_TURN_PANEL_CLASS}
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
              transition={transition}
              onClick={(event) => event.stopPropagation()}
            >
              <InGameParchmentPanel data-night-turn-role={announcement.role}>
                <p className={INGAME_NIGHT_TURN_MESSAGE_CLASS}>{announcement.message}</p>
                <p className={INGAME_NIGHT_TURN_META_CLASS}>밤이 깊어갑니다</p>
                <button
                  type="button"
                  className={INGAME_NIGHT_TURN_CLOSE_BUTTON_CLASS}
                  onClick={onClose}
                >
                  {INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL}
                </button>
              </InGameParchmentPanel>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
