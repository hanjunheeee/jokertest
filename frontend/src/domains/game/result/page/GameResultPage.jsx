// 게임 결과 화면: 연출 영상 → 결과(실제 판 또는 미리보기) → 대기방·로비 버튼, 우측 상단 남은 시간(180초), 떠나기 실패 안내
// /gameresult 라우트가 씀, 그릴 결과가 없으면 확인 불가 안내만 보여 줌
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import LabelledActionButton from "@/domains/game/shared/components/LabelledActionButton.jsx"
import GameResultIntroVideo from "../components/GameResultIntroVideo.jsx"
import GameResultShell from "../components/GameResultShell.jsx"
import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import { LOBBY_BTN_REVEAL_DELAY } from "../constants/gameResultEntranceMotion.js"
import {
  GAME_RESULT_LOBBY_BUTTON_LABEL,
  GAME_RESULT_MATCHING_BUTTON_LABEL,
  GAME_RESULT_MATCHING_PENDING_LABEL,
} from "../constants/gameResultLabels.js"
import { LOBBY_BTN_WRAP_CLASS } from "../constants/gameResultLayout.js"
import { GAME_RESULT_OUTCOMES } from "../constants/gameResultPreviewData.js"
import {
  BOOTSTRAP_HOLD_MS,
  PLAIN_BTN_CLASS,
  RESULT_UNAVAILABLE_BODY,
  RESULT_UNAVAILABLE_TITLE,
  UNAVAILABLE_BODY_CLASS,
  UNAVAILABLE_TITLE_CLASS,
  UNAVAILABLE_WRAP_CLASS,
} from "../constants/gameResultUnavailable.js"
import { useGameResultData } from "../hooks/useGameResultData.js"
import { useGameResultPreview } from "../hooks/useGameResultPreview.js"
import { useInGameExit } from "@/domains/game/ingame/hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectResultExitFailureNotice } from "@/domains/game/ingame/utils/exitConfirm.js"
import {
  useGameResultCloseTimer,
  useGameResultReturnToMatching,
  useResultSecondsLeft,
} from "../hooks/useGameResultReturnToMatching.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 우측 상단 남은 시간 칸 (어두운 바탕에 밝은 글자, 결과 틀 그림과 같은 금빛 테두리)
const CLOSE_TIMER_CLASS =
  "absolute right-[clamp(1.25rem,4vw,3rem)] top-[clamp(0.85rem,2.2vh,1.75rem)] z-20 flex items-baseline gap-[0.5rem] rounded-sm border border-[#c8a878]/60 bg-[#120a06]/80 px-[0.85rem] py-[0.45rem] font-subheading text-[#f5e6c8] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
const CLOSE_TIMER_LABEL_CLASS = "app-text-scaled [--app-text-size:clamp(0.78rem,1vw,0.92rem)] text-[#f0e0c8]/85"
const CLOSE_TIMER_VALUE_CLASS = "app-text-scaled [--app-text-size:clamp(1.1rem,1.6vw,1.4rem)] font-bold tabular-nums"

// 떠나기 실패 안내 (버튼 줄 바로 위 오른쪽, 붉은 바탕에 밝은 글자)
const LEAVE_NOTICE_CLASS =
  "absolute bottom-full right-0 mb-[0.6rem] w-max max-w-[min(30rem,80vw)] rounded-sm border border-[#c87878]/70 bg-[#2a1212]/90 px-[0.85rem] py-[0.55rem] text-right font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.1vw,0.98rem)] font-semibold leading-snug text-[#ffd8cc] [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"

// 남은 시간 칸: 이 칸만 반 초마다 다시 그림, 닫힘 시각 모르면 안 그림
function ResultCloseTimer({ closesAt }) {
  const secondsLeft = useResultSecondsLeft(closesAt)
  if (secondsLeft === null) return null
  return (
    <div
      role="timer"
      className={CLOSE_TIMER_CLASS}
      data-testid="result-close-timer"
      data-seconds-left={secondsLeft}
      aria-label={`결과 화면 남은 시간 ${secondsLeft}초, 끝나면 로비로 이동`}
      title="시간이 끝나면 로비로 이동합니다"
    >
      <span className={CLOSE_TIMER_LABEL_CLASS} aria-hidden="true">남은 시간</span>
      <span className={CLOSE_TIMER_VALUE_CLASS} aria-hidden="true">{secondsLeft}초</span>
    </div>
  )
}

// 대기방으로·로비로 동작과 실패 안내 (안내는 마지막에 누른 버튼 것만)
// "로비로"는 이름대로 로비로 감 (판 중 나가기는 멀티 화면), 실패 안내는 이 화면이 그려 알림 창은 끔
function useResultLeave() {
  const { requestExit, exitStatus, exitErrorCode, exitAttemptId, isExitPending } =
    useInGameExit({ destination: "/lobby", alertExitFailure: false })
  const { requestReturnToMatching, isReturning, returnError, clearReturnError } = useGameResultReturnToMatching()
  const [noticeSource, setNoticeSource] = useState(null)
  const [seenExitAttemptId, setSeenExitAttemptId] = useState(exitAttemptId)
  // 브라우저 뒤로 가기(useBlocker)가 requestExit를 불러도 실패 안내가 보이게 시도 번호 바뀜을 따라감
  if (exitAttemptId !== seenExitAttemptId) {
    setSeenExitAttemptId(exitAttemptId)
    if (exitAttemptId > 0) setNoticeSource("exit")
  }
  useEffect(() => {
    if (exitAttemptId > 0) clearReturnError()
  }, [exitAttemptId, clearReturnError])
  const exitNotice = selectResultExitFailureNotice(exitStatus, exitErrorCode)
  // 예: "exit"이고 연결 끊김 실패 → "연결이 끊겨 로비로 가지 못했습니다…", 누른 적 없으면 null
  const notice = { exit: exitNotice, return: returnError }[noticeSource] ?? null

  // 대기방으로: 로비로 가는 중엔 막음 / 로비로: 대기방 가는 중엔 막음 (늦은 답이 반대쪽으로 끌고 가지 않게)
  const onReturn = () => {
    if (isReturning || isExitPending) return
    setNoticeSource("return")
    requestReturnToMatching()
  }
  const onExit = () => {
    if (isReturning) return
    setNoticeSource("exit")
    clearReturnError()
    requestExit()
  }

  return { notice, noticeSource, isReturning, locked: isReturning || isExitPending, onReturn, onExit }
}

// 대기방·로비 버튼과 그 위 떠나기 실패 안내 (대기방·로비 어느 쪽이든 가는 중엔 두 버튼 다 잠금)
function ResultLeaveButtons({ notice, noticeSource, isReturning, locked, onReturn, onExit }) {
  return (
    <>
      {notice ? (
        <p role="alert" className={LEAVE_NOTICE_CLASS} data-testid="result-leave-notice" data-notice-source={noticeSource}>
          {notice}
        </p>
      ) : null}
      <LabelledActionButton
        src={GAME_RESULT_ASSETS.matchingButton}
        label={isReturning ? GAME_RESULT_MATCHING_PENDING_LABEL : GAME_RESULT_MATCHING_BUTTON_LABEL}
        disabled={locked}
        onClick={onReturn}
      />
      <LabelledActionButton
        src={GAME_RESULT_ASSETS.lobbyButton}
        label={GAME_RESULT_LOBBY_BUTTON_LABEL}
        disabled={locked}
        onClick={onExit}
      />
    </>
  )
}

export default function GameResultPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [introComplete, setIntroComplete] = useState(false)
  const live = useGameResultData()
  const preview = useGameResultPreview()
  const leave = useResultLeave()
  // 서버가 준 닫힘 시각, 서버가 닫으면 로비로
  const { closesAt } = useGameResultCloseTimer()

  const bootstrapStatus = useInGameSessionSnapshotSync()

  const hasLiveSession = useInGameStore((s) => Boolean(s.state) && s.state.phase !== "ENDED")
  const previewRequested =
    !hasLiveSession && GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
  const view = live ?? (previewRequested ? preview : null)

  const [holdExpired, setHoldExpired] = useState(false)
  useEffect(() => {
    if (view || bootstrapStatus !== "checking") return undefined
    const timer = window.setTimeout(() => setHoldExpired(true), BOOTSTRAP_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [view, bootstrapStatus])

  const bootstrapPending = bootstrapStatus === "checking" && !holdExpired

  // 결과 종류가 바뀌면 연출을 다시 봄 (그리는 중에 앞 값과 비교해 바로 맞춤)
  const outcome = view?.outcome ?? null
  const [introOutcome, setIntroOutcome] = useState(outcome)
  if (outcome !== null && outcome !== introOutcome) {
    setIntroOutcome(outcome)
    setIntroComplete(false)
  }

  if (!view && bootstrapPending) return null

  if (view) {
    if (!introComplete) {
      return (
        <GameResultIntroVideo
          outcome={view.outcome}
          onComplete={() => setIntroComplete(true)}
        />
      )
    }
  }

  return (
    <>
      {view ? <ResultCloseTimer closesAt={closesAt} /> : null}
      {view ? (
        <GameResultShell {...view} />
      ) : (
        <div className={UNAVAILABLE_WRAP_CLASS}>
          <p role="alert" className={UNAVAILABLE_TITLE_CLASS}>{RESULT_UNAVAILABLE_TITLE}</p>
          <p className={UNAVAILABLE_BODY_CLASS}>{RESULT_UNAVAILABLE_BODY}</p>
        </div>
      )}
      <motion.div
        className={LOBBY_BTN_WRAP_CLASS}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: LOBBY_BTN_REVEAL_DELAY }}
      >
        {view ? (
          <ResultLeaveButtons {...leave} />
        ) : (
          <button
            type="button"
            className={PLAIN_BTN_CLASS}
            onClick={() => navigate("/lobby", { replace: true })}
          >
            로비로 돌아가기
          </button>
        )}
      </motion.div>

    </>
  )
}
