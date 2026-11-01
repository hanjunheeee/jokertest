// 재판 연출 창: 피고 카드·투표 버튼 먼저, 잠시 뒤 옆에 채팅 열림
// 재판 연출 문지기(Gate)·재판 연출 미리보기 화면이 사용
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useEffect, useState } from "react"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  TRIBUNAL_VOTE_GUILTY_LABEL,
  TRIBUNAL_VOTE_NOT_GUILTY_LABEL,
} from "../../constants/actions/ingameActionPanel.js"
import { PLAYER_CARD_OVERLAY_ASSETS } from "../../constants/board/ingamePlayerCardOverlayAssets.js"
import {
  ACTION_BTN_CLASS,
  ACTION_BTN_IMG_CLASS,
  ACTION_BTN_LABEL_CLASS,
  ACTIONS_CLASS,
  BACKDROP_CLASS,
  CARD_WRAP_CLASS,
  CHAT_WRAP_CLASS,
  CLUSTER_CLASS,
  INTRO_HOLD_MS,
  DEV_RESOLVE_BTN_CLASS,
  DEV_RESOLVE_WRAP_CLASS,
  LEFT_COLUMN_CLASS,
  NOTICE_CLASS,
  ROW_CLASS,
  SHELL_CLASS,
  STAGE_CLASS,
} from "../../constants/tribunalPresentation/ingameTribunalPresentationLayout.js"
import {
  BACKDROP_MOTION,
  BTN_MOTION,
  CARD_MOTION,
  CHAT_MOTION,
} from "../../constants/tribunalPresentation/ingameTribunalPresentationMotion.js"
import InGamePlayerCard from "../board/InGamePlayerCard.jsx"
import InGameTribunalPresentationChatPanel from "./InGameTribunalPresentationChatPanel.jsx"

// 유죄·무죄 그림 버튼 하나, 나타나는 늦춤은 motionDelay
function TribunalVoteButton({ label, assetSrc, disabled, onClick, motionDelay }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={ACTION_BTN_CLASS}
      style={{ outline: "none" }}
      variants={BTN_MOTION}
      initial={reduceMotion ? false : "hidden"}
      animate={reduceMotion ? undefined : "visible"}
      custom={motionDelay}
    >
      <PublicAsset src={assetSrc} alt="" className={ACTION_BTN_IMG_CLASS} />
      <span className={ACTION_BTN_LABEL_CLASS}>{label}</span>
    </motion.button>
  )
}

// 처음엔 채팅 없이(intro), 정한 시간 뒤 채팅 열림(split)
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
  devResolveLabel = null,
  devResolveEnabled = false,
  onDevResolve = null,
}) {
  const reduceMotion = useReducedMotion()
  const [layoutPhase, setLayoutPhase] = useState("intro")

  // 열릴 때·피고 바뀔 때 intro부터, 움직임 줄이기면 바로 split
  useEffect(() => {
    // 닫히면 처음 단계로 되돌림
    if (!open) {
      setLayoutPhase("intro")
      return undefined
    }

    // 움직임 줄이기 설정이면 기다리지 않음
    if (reduceMotion) {
      setLayoutPhase("split")
      return undefined
    }

    setLayoutPhase("intro")
    const timer = window.setTimeout(() => {
      setLayoutPhase("split")
    }, INTRO_HOLD_MS)

    return () => window.clearTimeout(timer)
  }, [open, reduceMotion, defendant?.id])

  // 피고 없으면 안 그림
  if (!defendant) return null

  // 채팅은 split 단계이고 채팅 값 있을 때만
  const showChat = layoutPhase === "split" && chatProps

  // 투표 버튼 못 보이면 대신 안내 문구, 판정 버튼은 글자 받았을 때만
  return (
    <AnimatePresence>
      {open ? (
        <div
          className={SHELL_CLASS}
          role="presentation"
          data-ingame-tribunal-presentation=""
          data-ingame-tribunal-layout={layoutPhase}
          aria-hidden={!open}
        >
          <motion.div
            className={BACKDROP_CLASS}
            variants={BACKDROP_MOTION}
            initial={reduceMotion ? false : "hidden"}
            animate={reduceMotion ? undefined : "visible"}
            exit="hidden"
            aria-hidden="true"
          />

          <div className={STAGE_CLASS}>
            <div className={ROW_CLASS}>
              <div className={CLUSTER_CLASS}>
              <div className={LEFT_COLUMN_CLASS}>
                <motion.div
                  className={CARD_WRAP_CLASS}
                  variants={CARD_MOTION}
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
                    className={ACTIONS_CLASS}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={reduceMotion ? undefined : { opacity: 1 }}
                    transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.18 }}
                  >
                    <TribunalVoteButton
                      label={TRIBUNAL_VOTE_GUILTY_LABEL}
                      assetSrc={PLAYER_CARD_OVERLAY_ASSETS.cancelButton}
                      disabled={!voteButtonsEnabled || voteSubmitting}
                      onClick={() => onVoteGuilty?.()}
                      motionDelay={0.16}
                    />
                    <TribunalVoteButton
                      label={TRIBUNAL_VOTE_NOT_GUILTY_LABEL}
                      assetSrc={PLAYER_CARD_OVERLAY_ASSETS.confirmButton}
                      disabled={!voteButtonsEnabled || voteSubmitting}
                      onClick={() => onVoteNotGuilty?.()}
                      motionDelay={0.28}
                    />
                  </motion.div>
                ) : noticeText ? (
                  <p className={NOTICE_CLASS}>
                    {noticeText}
                  </p>
                ) : null}
              </div>

              <AnimatePresence>
                {showChat ? (
                  <motion.div
                    key="tribunal-chat"
                    className={CHAT_WRAP_CLASS}
                    variants={CHAT_MOTION}
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

            {devResolveLabel ? (
              <div className={DEV_RESOLVE_WRAP_CLASS}>
                <button
                  type="button"
                  className={DEV_RESOLVE_BTN_CLASS}
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
