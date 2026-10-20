import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useState } from "react"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  TRIBUNAL_VOTE_GUILTY_LABEL,
  TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
} from "../../constants/actions/ingameActionPanel.js"
import { INGAME_PLAYER_CARD_OVERLAY_ASSETS } from "../../constants/board/ingamePlayerCardOverlayAssets.js"
import {
  INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_IMG_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_LABEL_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_ACTIONS_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_BACKDROP_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_CARD_WRAP_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_CHAT_WRAP_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_CLUSTER_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_INTRO_HOLD_MS,
  INGAME_TRIBUNAL_PRESENTATION_DEV_RESOLVE_BTN_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_DEV_RESOLVE_WRAP_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_LEFT_COLUMN_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_NOTICE_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_ROW_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_SHELL_CLASS,
  INGAME_TRIBUNAL_PRESENTATION_STAGE_CLASS,
} from "../../constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import {
  INGAME_TRIBUNAL_PRESENTATION_BACKDROP_MOTION,
  INGAME_TRIBUNAL_PRESENTATION_BUTTON_MOTION,
  INGAME_TRIBUNAL_PRESENTATION_CARD_MOTION,
  INGAME_TRIBUNAL_PRESENTATION_CHAT_MOTION,
} from "../../constants/tribunalPresentation/ingameTribunalPresentationMotion.js"
import InGamePlayerCard from "../board/InGamePlayerCard.jsx"
import InGameTribunalPresentationChatPanel from "./InGameTribunalPresentationChatPanel.jsx"

function TribunalVoteButton({ label, assetSrc, disabled, onClick, motionDelay }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_CLASS}
      style={{ outline: "none" }}
      variants={INGAME_TRIBUNAL_PRESENTATION_BUTTON_MOTION}
      initial={reduceMotion ? false : "hidden"}
      animate={reduceMotion ? undefined : "visible"}
      custom={motionDelay}
    >
      <PublicAsset src={assetSrc} alt="" className={INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_IMG_CLASS} />
      <span className={INGAME_TRIBUNAL_PRESENTATION_ACTION_BTN_LABEL_CLASS}>{label}</span>
    </motion.button>
  )
}

/**
 * 최후의 반론(TRIBUNAL) — 피고 카드·유/무죄 버튼 전면 연출 → 좌측 이동 + 우측 채팅 split.
 * 게임 열(absolute) 안에서만 그려져 좌우 배너를 침범하지 않는다.
 */
export default function InGameTribunalPresentationOverlay({
  open = false,
  defendant = null,
  showVoteButtons = false,
  noticeText = null,
  voteButtonsEnabled = false,
  voteSubmitting = false,
  onVoteGuilty,
  onVoteNotGuilty,
  chatProps = null,
  /** DEV 임시 — 개발 끝나면 삭제 */
  devResolveLabel = null,
  devResolveEnabled = false,
  onDevResolve = null,
}) {
  const reduceMotion = useReducedMotion()
  const [layoutPhase, setLayoutPhase] = useState("intro")

  useEffect(() => {
    if (!open) {
      setLayoutPhase("intro")
      return undefined
    }

    if (reduceMotion) {
      setLayoutPhase("split")
      return undefined
    }

    setLayoutPhase("intro")
    const timer = window.setTimeout(() => {
      setLayoutPhase("split")
    }, INGAME_TRIBUNAL_PRESENTATION_INTRO_HOLD_MS)

    return () => window.clearTimeout(timer)
  }, [open, reduceMotion, defendant?.id])

  if (!defendant) return null

  const showChat = layoutPhase === "split" && chatProps

  return (
    <AnimatePresence>
      {open ? (
        <div
          className={INGAME_TRIBUNAL_PRESENTATION_SHELL_CLASS}
          role="presentation"
          data-ingame-tribunal-presentation=""
          data-ingame-tribunal-layout={layoutPhase}
          aria-hidden={!open}
        >
          <motion.div
            className={INGAME_TRIBUNAL_PRESENTATION_BACKDROP_CLASS}
            variants={INGAME_TRIBUNAL_PRESENTATION_BACKDROP_MOTION}
            initial={reduceMotion ? false : "hidden"}
            animate={reduceMotion ? undefined : "visible"}
            exit="hidden"
            aria-hidden="true"
          />

          <div className={INGAME_TRIBUNAL_PRESENTATION_STAGE_CLASS}>
            <div className={INGAME_TRIBUNAL_PRESENTATION_ROW_CLASS}>
              <div className={INGAME_TRIBUNAL_PRESENTATION_CLUSTER_CLASS}>
              <div className={INGAME_TRIBUNAL_PRESENTATION_LEFT_COLUMN_CLASS}>
                <motion.div
                  className={INGAME_TRIBUNAL_PRESENTATION_CARD_WRAP_CLASS}
                  variants={INGAME_TRIBUNAL_PRESENTATION_CARD_MOTION}
                  initial={reduceMotion ? false : "hidden"}
                  animate={reduceMotion ? undefined : "visible"}
                >
                  <InGamePlayerCard
                    portraitSrc={defendant.portraitSrc}
                    frameSrc={defendant.frameSrc}
                    nickname={defendant.nickname}
                    status={defendant.status}
                    theme={defendant.theme}
                    className="w-full"
                  />
                </motion.div>

                {showVoteButtons ? (
                  <motion.div
                    className={INGAME_TRIBUNAL_PRESENTATION_ACTIONS_CLASS}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={reduceMotion ? undefined : { opacity: 1 }}
                    transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.18 }}
                  >
                    <TribunalVoteButton
                      label={TRIBUNAL_VOTE_GUILTY_LABEL}
                      assetSrc={INGAME_PLAYER_CARD_OVERLAY_ASSETS.cancelButton}
                      disabled={!voteButtonsEnabled || voteSubmitting}
                      onClick={() => onVoteGuilty?.()}
                      motionDelay={0.16}
                    />
                    <TribunalVoteButton
                      label={TRIBUNAL_VOTE_NOT_GUILTY_LABEL}
                      assetSrc={INGAME_PLAYER_CARD_OVERLAY_ASSETS.confirmButton}
                      disabled={!voteButtonsEnabled || voteSubmitting}
                      onClick={() => onVoteNotGuilty?.()}
                      motionDelay={0.28}
                    />
                  </motion.div>
                ) : noticeText ? (
                  <p className={INGAME_TRIBUNAL_PRESENTATION_NOTICE_CLASS}>
                    {noticeText}
                  </p>
                ) : null}
              </div>

              <AnimatePresence>
                {showChat ? (
                  <motion.div
                    key="tribunal-chat"
                    className={INGAME_TRIBUNAL_PRESENTATION_CHAT_WRAP_CLASS}
                    variants={INGAME_TRIBUNAL_PRESENTATION_CHAT_MOTION}
                    initial={reduceMotion ? false : "hidden"}
                    animate={reduceMotion ? undefined : "visible"}
                    exit="hidden"
                  >
                    <InGameTribunalPresentationChatPanel {...chatProps} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
              </div>
            </div>

            {/* DEV 임시: 연출 하단 고정 — 카드·투표 UI와 무관(개발 끝나면 삭제) */}
            {devResolveLabel ? (
              <div className={INGAME_TRIBUNAL_PRESENTATION_DEV_RESOLVE_WRAP_CLASS}>
                <button
                  type="button"
                  className={INGAME_TRIBUNAL_PRESENTATION_DEV_RESOLVE_BTN_CLASS}
                  data-dev-tribunal-resolve=""
                  disabled={!devResolveEnabled}
                  onClick={() => onDevResolve?.()}
                >
                  {devResolveLabel}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
