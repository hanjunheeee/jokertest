/**
 * 게임 결과 화면 — prototype 게임 결과창 시안-승리/패배.png
 *
 * 실제 게임이 끝나면 store에 남아 있는 winResult(승리 진영)로 그린다.
 * 개발: /gameresult?outcome=win | /gameresult?outcome=lose (실데이터가 없을 때만 쓰이는 더미)
 */
import { motion } from "framer-motion"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import LabelledActionButton from "@/domains/game/mode/components/LabelledActionButton.jsx"
import GameResultIntroVideo from "../components/GameResultIntroVideo.jsx"
import GameResultShell from "../components/GameResultShell.jsx"
import { GAME_RESULT_ASSETS } from "../constants/gameResultAssets.js"
import { GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY } from "../constants/gameResultEntranceMotion.js"
import { GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS } from "../constants/gameResultLayout.js"
import { GAME_RESULT_OUTCOMES } from "../constants/gameResultPreviewData.js"
import { useGameResultData } from "../hooks/useGameResultData.js"
import { useGameResultPreview } from "../hooks/useGameResultPreview.js"
import { useInGameExit } from "@/domains/game/ingame/hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "@/domains/game/ingame/hooks/useInGameSessionSnapshotSync.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

/**
 * F-24(A-14): 참가 조회를 기다리는 **상한**. 스냅샷 요청 자체의 상한(5초)보다 길게 둬서,
 * 정상적으로 답이 오는 경로는 이 값에 걸리지 않는다. 이 상한이 없으면 요청이 아예 나가지
 * 못한 상황(연결이 없거나 끝내 열리지 않는 경우)에서 확인이 영영 끝나지 않아, 화면이
 * 아무것도 그리지 않은 채 로비로 돌아갈 방법도 없는 막다른 길이 된다 — 실패 경로를 숨기지
 * 않는다는 계약은 "성급히 쫓아내지 않는다"와 "영영 붙잡아 두지 않는다"를 함께 뜻한다.
 */
const RESULT_BOOTSTRAP_HOLD_MS = 6000

// 결과 화면의 평범한 텍스트 버튼(확인 불가 화면의 '로비로 돌아가기'). 결과 화면에서 방 번호를
// 보여 주던 진입은 운영자 지시로 삭제했다(2026-09-22) — 번호는 대기방에서만 본다.
const RESULT_PLAIN_BUTTON_CLASS =
  "cursor-pointer border-0 bg-transparent p-0 font-subheading app-text-scaled [--app-text-size:clamp(0.85rem,1.2vw,1.05rem)] font-semibold text-[#f5e6c8] underline decoration-dotted underline-offset-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

/** 확인 불가 화면의 안내 문구 스타일. 결과 연출 없이 사실만 읽어 준다. */
const UNAVAILABLE_WRAP_CLASS =
  "absolute inset-0 z-10 flex flex-col items-center justify-center gap-[1.1rem] px-[clamp(1rem,5vw,3rem)] text-center"
const UNAVAILABLE_TITLE_CLASS =
  "font-subheading app-text-scaled [--app-text-size:clamp(1.05rem,2vw,1.6rem)] font-bold text-[#f5e6c8] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]"
const UNAVAILABLE_BODY_CLASS =
  "max-w-[36rem] font-subheading app-text-scaled [--app-text-size:clamp(0.82rem,1.25vw,1rem)] leading-relaxed text-[#f0e0c8]/85"

/**
 * F-24(A-14): 결과·코드를 확인할 수 없을 때 화면이 말하는 문장.
 *
 * "없는 것을 꾸미지 않는다"와 "실패 경로를 숨기지 않는다"를 동시에 지킨다 — 결과·명단·코드를
 * 지어내지 않고, 대신 무엇을 확인할 수 없는지와 왜 그런지를 그대로 읽어 준다.
 */
const RESULT_UNAVAILABLE_TITLE = "게임 결과를 확인할 수 없습니다"
const RESULT_UNAVAILABLE_BODY =
  "이 판의 결과는 화면이 종료까지 받아 둔 값으로만 보여드립니다. 새로고침 등으로 그 값이 사라졌거나 이 계정의 참가 자격이 이미 정리된 경우에는 다시 불러올 수 없습니다."

/**
 * 결과 페이지 최상위 — 실데이터를 우선하고, 없으면 `?outcome=` 미리보기, 둘 다 없으면 로비로 보낸다.
 *
 * 로비 복귀는 결과 화면 전용 이탈 경로를 새로 만들지 않고 기존 인게임 종료 경로
 * (useInGameExit → createLeaveGameSessionRequest → createSessionEndFinalizer)를 그대로 쓴다 —
 * 이탈 요청·store 정리·/multiplay 이동 계약이 인게임 나가기와 한 곳에서 갈리지 않는다.
 */
export default function GameResultPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [introComplete, setIntroComplete] = useState(false)
  const live = useGameResultData()
  const preview = useGameResultPreview()
  const { requestExit } = useInGameExit()

  /**
   * F-24(AC-01/AC-02, A-14): **서버 참가 소속으로만** 이 화면의 상태를 다시 묻는다.
   *
   * 새로고침하면 메모리 store가 비어 결과도 코드도 없다. 그때 곧바로 로비로 보내면 실제로는
   * 아직 참가 자격이 남아 있는 계정까지 쫓아내고, 그 판의 코드도 영영 확인할 수 없다. 이
   * 훅은 코드가 아니라 서버 참가 매핑으로 스냅샷을 조회하므로(get_session_snapshot),
   * 자격이 없는 계정에는 아무것도 돌려주지 않는다 — 코드로 권한을 복구하지 않는다는 계약이
   * 그대로 유지된다. 조회가 끝나기 전에는 이동을 보류한다.
   */
  const bootstrapStatus = useInGameSessionSnapshotSync()

  // 아직 끝나지 않은 게임이 store에 남아 있으면 `?outcome=`으로도 결과·역할 공개를 미리
  // 보여주지 않는다 — 더미 명단이라도 진행 중인 판에서는 결과 화면 자체가 열리면 안 된다.
  const hasLiveSession = useInGameStore((s) => Boolean(s.state) && s.state.phase !== "ENDED")
  const previewRequested =
    !hasLiveSession && GAME_RESULT_OUTCOMES.includes(searchParams.get("outcome"))
  const view = live ?? (previewRequested ? preview : null)

  // F-24(A-14): 확인 보류를 유한하게 만드는 유일한 장치다. 조회가 실제로 나간 경우에는
  // 훅이 5초 안에 스스로 checking을 끝내므로 이 타이머는 깨어나지 않는다 — 요청이 아예
  // 나가지 못한 경우(연결 없음)만 여기서 걸러진다.
  const [holdExpired, setHoldExpired] = useState(false)
  useEffect(() => {
    if (view || bootstrapStatus !== "checking") return undefined
    const timer = window.setTimeout(() => setHoldExpired(true), RESULT_BOOTSTRAP_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [view, bootstrapStatus])

  /**
   * F-24(A-14): 확인이 끝났는데도 보여줄 결과가 없다 = **확인 불가**다.
   *
   * 예전에는 이 상태에서 null을 그리고 곧바로 /multiplay로 replace했다. 그러면 사용자는
   * 아무 안내도 보지 못한 채 로비에 서 있게 되고, "코드를 확인할 수 없음"이라는 실패 경로가
   * 화면에서 통째로 사라진다 — A-14가 명시적으로 금지하는 동작이다. 자동 이동을 걷어내고,
   * 확인 불가 상태를 **화면으로** 보여준 뒤 로비 이동은 사용자의 입력으로 남긴다.
   *
   * 조회가 진행 중인 동안에는(그리고 상한 전까지는) 아직 아무것도 단정하지 않는다.
   */
  const bootstrapPending = bootstrapStatus === "checking" && !holdExpired

  useEffect(() => {
    if (!view) return
    setIntroComplete(false)
  }, [view?.outcome])

  // 아직 확인 중이면 아무것도 단정하지 않는다(결과도, 확인 불가도 아니다).
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
      {view ? (
        <GameResultShell {...view} />
      ) : (
        /*
          F-24(A-14): 확인 불가 화면. 결과·명단·코드를 **꾸미지 않고** 무엇을 확인할 수 없는지만
          읽어 준다. 연출(GameResultIntroVideo)도 재생하지 않는다 — 없는 승패를 연출할 수 없다.
        */
        <div className={UNAVAILABLE_WRAP_CLASS}>
          <p role="alert" className={UNAVAILABLE_TITLE_CLASS}>{RESULT_UNAVAILABLE_TITLE}</p>
          <p className={UNAVAILABLE_BODY_CLASS}>{RESULT_UNAVAILABLE_BODY}</p>
        </div>
      )}
      <motion.div
        className={GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY }}
      >
        {/*
          로비 이동은 결과가 있을 때만 **실제 이탈**이다 — 그때만 기존 종료 경로(useInGameExit)를
          부른다. 확인 불가 화면에는 정리할 참가 소속도, 확인을 물을 것도 없으므로 결과 화면의
          장식 버튼 대신 화면 이동만 하는 평범한 버튼을 둔다(이탈 요청은 만들지 않는다).
        */}
        {view ? (
          <LabelledActionButton
            src={GAME_RESULT_ASSETS.lobbyButton}
            label="로비로"
            onClick={requestExit}
          />
        ) : (
          <button
            type="button"
            className={RESULT_PLAIN_BUTTON_CLASS}
            onClick={() => navigate("/multiplay", { replace: true })}
          >
            로비로 돌아가기
          </button>
        )}
      </motion.div>

    </>
  )
}
