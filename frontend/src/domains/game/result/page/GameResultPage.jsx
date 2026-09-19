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
import RoomCodeViewModal from "@/domains/game/matching/components/RoomCodeViewModal.jsx"
import { isValidRoomCode } from "@/domains/game/matching/utils/roomCode.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

/**
 * F-24(A-14): 참가 조회를 기다리는 **상한**. 스냅샷 요청 자체의 상한(5초)보다 길게 둬서,
 * 정상적으로 답이 오는 경로는 이 값에 걸리지 않는다. 이 상한이 없으면 요청이 아예 나가지
 * 못한 상황(연결이 없거나 끝내 열리지 않는 경우)에서 확인이 영영 끝나지 않아, 화면이
 * 아무것도 그리지 않은 채 로비로 돌아갈 방법도 없는 막다른 길이 된다 — 실패 경로를 숨기지
 * 않는다는 계약은 "성급히 쫓아내지 않는다"와 "영영 붙잡아 두지 않는다"를 함께 뜻한다.
 */
const RESULT_BOOTSTRAP_HOLD_MS = 6000

/** 결과 화면의 방 코드 진입 버튼. 로비 버튼과 같은 줄에 놓인다. */
const ROOM_CODE_BUTTON_CLASS =
  "cursor-pointer border-0 bg-transparent p-0 font-subheading app-text-scaled [--app-text-size:clamp(0.85rem,1.2vw,1.05rem)] font-semibold text-[#f5e6c8] underline decoration-dotted underline-offset-4 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

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
  const [roomCodeOpen, setRoomCodeOpen] = useState(false)
  const live = useGameResultData()
  const preview = useGameResultPreview()
  const { requestExit } = useInGameExit()

  // F-24(AC-01, A-14): 종료까지 이 화면이 받아 둔 코드. 없으면 null이고, 그 상태가 곧
  // "확인할 수 없음"이다(다른 곳에서 복원해 오지 않는다).
  const roomCode = useInGameStore((s) => s.state?.roomCode ?? null)
  const canViewRoomCode = isValidRoomCode(roomCode)

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

  useEffect(() => {
    if (view) return
    // F-24(A-14): **확인이 끝나기 전에는 보내지 않는다.** 예전에는 첫 렌더에서 곧바로
    // 로비로 replace했는데, 새로고침 직후에는 store가 비어 있는 것이 정상이라 정상 참가자도
    // 그 한 프레임에 쫓겨났다. 조회가 끝나 결과가 없다는 것이 확인된 뒤에만 이동한다.
    if (bootstrapStatus === "checking" && !holdExpired) return
    navigate("/multiplay", { replace: true })
  }, [view, bootstrapStatus, holdExpired, navigate])

  useEffect(() => {
    if (!view) return
    setIntroComplete(false)
  }, [view?.outcome])

  if (!view) return null

  if (!introComplete) {
    return (
      <GameResultIntroVideo
        outcome={view.outcome}
        onComplete={() => setIntroComplete(true)}
      />
    )
  }

  return (
    <>
      <GameResultShell {...view} />
      <motion.div
        className={GAME_RESULT_LOBBY_BUTTON_WRAP_CLASS}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...UI_REVEAL_TRANSITION, delay: GAME_RESULT_LOBBY_BUTTON_REVEAL_DELAY }}
      >
        {/*
          F-24(AC-01/AC-02, A-14): 종료 직후의 방 코드 보기·복사.

          코드의 원천은 **이 화면이 종료까지 받아 둔 현재 계정의 값**(state.roomCode)뿐이다.
          새로고침으로 그 값이 사라졌거나 서버 참가 매핑이 이미 정리됐다면 복원하지 않는다 —
          세션 보존 계약을 새로 만들지 않고, 다른 계정의 잔존 코드나 더미를 대신 보여주지도
          않는다. 값이 없으면 진입 자체가 "확인 불가"이고, 눌러도 모달이 그 사실과 비활성
          복사를 그대로 보여준다.

          preview(`?outcome=`) 진입에는 실제 코드 진입을 주지 않는다 — 더미 결과 화면에서
          복사되는 코드는 어느 방도 가리키지 않는다.
        */}
        {live ? (
          <button type="button" className={ROOM_CODE_BUTTON_CLASS} onClick={() => setRoomCodeOpen(true)}>
            {canViewRoomCode ? "방 코드 보기" : "방 코드 확인 불가"}
          </button>
        ) : null}
        <LabelledActionButton
          src={GAME_RESULT_ASSETS.lobbyButton}
          label="로비로"
          onClick={requestExit}
        />
      </motion.div>

      <RoomCodeViewModal
        open={roomCodeOpen}
        onClose={() => setRoomCodeOpen(false)}
        roomCode={roomCode}
      />
    </>
  )
}
