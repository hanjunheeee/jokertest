// 파일 역할: InGameRoleRevealOverlay.jsx - 화면을 구성하는 컴포넌트입니다.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect } from "react"
import {
  INGAME_ROLE_REVEAL_ALLY_CHIP_CLASS,
  INGAME_ROLE_REVEAL_ALLY_LIST_CLASS,
  INGAME_ROLE_REVEAL_ALLY_SECTION_CLASS,
  INGAME_ROLE_REVEAL_BACKDROP_CLASS,
  INGAME_ROLE_REVEAL_DESCRIPTION_CLASS,
  INGAME_ROLE_REVEAL_HEADER_CLASS,
  INGAME_ROLE_REVEAL_NICKNAME_CLASS,
  INGAME_ROLE_REVEAL_PANEL_CLASS,
  INGAME_ROLE_REVEAL_PANEL_REDUCED_TRANSITION,
  INGAME_ROLE_REVEAL_PANEL_TRANSITION,
  INGAME_ROLE_REVEAL_PANEL_WRAP_CLASS,
  INGAME_ROLE_REVEAL_PRIMARY_BUTTON_CLASS,
  INGAME_ROLE_REVEAL_ROLE_NAME_CLASS,
  INGAME_ROLE_REVEAL_TEAM_BADGE_CLASS,
} from "../../constants/roleReveal/ingameRoleRevealLayout.js"
import { resolveInGameRoleRevealAllies } from "../../utils/resolveInGameRoleRevealAllies.js"
import InGameParchmentPanel from "../parchment/InGameParchmentPanel.jsx"

/**
 * 인게임 파치먼트 역할 공개 — 전체 화면 오버레이.
 * 패널 배경은 공용 파치먼트 셸(InGameParchmentPanel)이 그린다 — 밤 역할 턴 안내 오버레이와
 * 같은 배경 이미지를 공유한다.
 * 닫기/다시 열기는 완전히 로컬 UI 상태다: socket emit·REST 요청·canonical 세션 상태 변경이
 * 전혀 없고, phase 전이나 게임 액션을 막지도 않는다(useInGameRoleReveal 참고).
 */
export default function InGameRoleRevealOverlay({
  open,
  onClose,
  roleInfo,
  players = [],
  primaryLabel = "확인",
}) {
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  // 정의되지 않은/빈 역할은 절대 그리지 않는다 — open이 true여도 roleInfo가 없으면 아무 것도
  // 렌더하지 않는다(닉네임·역할·진영이 모두 갖춰졌을 때만 getInGameRoleRevealInfo가 값을 준다).
  if (!roleInfo) return null

  const allies = resolveInGameRoleRevealAllies(roleInfo.allies, players)
  const transition = prefersReducedMotion
    ? INGAME_ROLE_REVEAL_PANEL_REDUCED_TRANSITION
    : INGAME_ROLE_REVEAL_PANEL_TRANSITION
  const panelInitial = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scaleY: 0.06, y: -10 }
  const panelAnimate = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 1, scaleY: 1, y: 0 }
  const panelExit = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, scaleY: 0.08, y: -6 }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="내 역할 보기 닫기"
            className={INGAME_ROLE_REVEAL_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            onClick={onClose}
          />

          <div className={INGAME_ROLE_REVEAL_PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="내 역할 보기"
              className={INGAME_ROLE_REVEAL_PANEL_CLASS}
              style={{ transformOrigin: "center" }}
              initial={panelInitial}
              animate={panelAnimate}
              exit={panelExit}
              transition={transition}
              onClick={(event) => event.stopPropagation()}
            >
              <InGameParchmentPanel>
                <div className={INGAME_ROLE_REVEAL_HEADER_CLASS}>
                  {roleInfo.nickname ? (
                    <p className={INGAME_ROLE_REVEAL_NICKNAME_CLASS}>{roleInfo.nickname}</p>
                  ) : null}
                  <p className={INGAME_ROLE_REVEAL_ROLE_NAME_CLASS}>{roleInfo.roleName}</p>
                  <p className={INGAME_ROLE_REVEAL_TEAM_BADGE_CLASS}>{roleInfo.teamLabel}</p>
                </div>

                {roleInfo.description ? (
                  <p className={INGAME_ROLE_REVEAL_DESCRIPTION_CLASS}>{roleInfo.description}</p>
                ) : null}

                {allies.length ? (
                  <div className={INGAME_ROLE_REVEAL_ALLY_SECTION_CLASS}>
                    <p>동료 광대</p>
                    <ul className={INGAME_ROLE_REVEAL_ALLY_LIST_CLASS}>
                      {allies.map((ally) => (
                        <li key={ally.uuid} className={INGAME_ROLE_REVEAL_ALLY_CHIP_CLASS}>
                          {ally.nickname}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <button
                  type="button"
                  className={INGAME_ROLE_REVEAL_PRIMARY_BUTTON_CLASS}
                  onClick={onClose}
                >
                  {primaryLabel}
                </button>
              </InGameParchmentPanel>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
