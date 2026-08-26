import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import InGamePlayerBoard from "../components/board/InGamePlayerBoard.jsx"
import InGameChatShell from "../components/chat/InGameChatShell.jsx"
import InGameActionPanel from "../components/actions/InGameActionPanel.jsx"
import InGameRoleRevealOverlay from "../components/roleReveal/InGameRoleRevealOverlay.jsx"
import InGamePhaseEntranceOverlay from "../components/phaseEntrance/InGamePhaseEntranceOverlay.js"
import InGameNightTurnAnnouncementOverlay from "../components/nightTurn/InGameNightTurnAnnouncementOverlay.jsx"
import InGameNightPrivateResultOverlay from "../components/nightPrivateResult/InGameNightPrivateResultOverlay.js"
import InGameKillRevealOverlay from "../components/killReveal/InGameKillRevealOverlay.js"
import { InGamePlayerSessionProvider } from "../components/InGamePlayerSessionProvider.jsx"
import InGameTopControls from "../components/controls/InGameTopControls.jsx"
import PlayerRecordListPanel from "../components/controls/playerRecordList/PlayerRecordListPanel.jsx"
import InGameTimebar from "../components/timebar/InGameTimebar.jsx"
import { INGAME_ASSETS } from "../constants/ingameAssets.js"
import { mapGamePhaseToTimebarPhaseId } from "../constants/timebar/ingameTimebarAssets.js"
import { selectInGameTimebarStatusMessage } from "../utils/selectInGameTimebarStatusMessage.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useInGameExit } from "../hooks/useInGameExit.js"
import { useInGameSessionSnapshotSync } from "../hooks/useInGameSessionSnapshotSync.js"
import { useInGameOverlayStack } from "../hooks/useInGameOverlayStack.js"
import { useInGameResultNavigation } from "../hooks/useInGameResultNavigation.js"
import { publicAsset } from "@/shared/utils/publicAsset"
import { BG_FADE_TRANSITION } from "@/shared/constants/pageTransitions.js"

/**
 * 인게임 화면 전체(배경 + 컨트롤 + 타임바 + 플레이어 보드 + 채팅)를 조합하는 최상위 페이지
 * @flow 유효한 GameSession 상태가 없으면 아무것도 그리지 않고 /multiplay로 돌려보내고, 게임이
 *   끝나면(ENDED) 사망 연출 큐가 다 빈 뒤 결과 페이지로 넘긴다.
 */
export default function InGamePage() {
  const [playerRecordListOpen, setPlayerRecordListOpen] = useState(false)
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const navigate = useNavigate()
  const { requestExit } = useInGameExit()
  // 재접속/재연결 시 get_session_snapshot으로 현재 phase까지의 상태를 원자적으로 복원한다.
  // 이후 이벤트 단위 실시간 동기화(night_result_applied 등)는 useGameSessionSocketEvents가
  // 별도로 담당한다 — 이 훅은 그 사이에 놓친 스냅샷만 재접속 시점에 채워 넣는다.
  useInGameSessionSnapshotSync()
  // 인게임 오버레이 스택 — 역할 공개, DAY/NIGHT 진입 연출, 밤 역할 턴 안내의 표시 순서를
  // 한 곳에서 결정한다(useInGameOverlayStack 참고). 각 오버레이가 서로의 상태를 알아야 하므로
  // 이 페이지 하나에서만 호출하고 아래로 내려보낸다 — InGameActionPanel의 "내 역할 보기"
  // 버튼과 역할 공개 오버레이도 여기서 같은 열림 상태를 공유한다.
  const { roleReveal, killReveal, nightPrivateResult, phaseEntrance, nightTurn, interactionBlocked } =
    useInGameOverlayStack()

  // 게임이 끝나면(ENDED + winResult 확정) 결과 페이지로 넘어간다 — 단, 이 밤의 사망 연출이
  // 재생 중이거나 큐에 남아 있는 동안은 기다린다(연출이 통째로 잘리지 않게).
  useInGameResultNavigation({ hold: killReveal.open || killReveal.pending })

  // 게임 중 새로고침 등으로 ingameStore가 비어있는 채 /ingame에 직접 진입하면(store가
  // 초기화되어 있음) 실제 참가자 대신 더미 프리뷰 데이터로 채워진 화면이 보인다. 유효한
  // GameSession 상태가 없으면 /multiplay로 돌려보낸다 — 새로고침한 당사자는 서버가
  // 재전송해줄 game_ended도 받을 수 없어 useGameSessionSocketEvents(전역 game_ended
  // 핸들러)만으로는 이 경로를 막지 못하므로, 이 guard로 보완한다.
  const isValidGameSession = Boolean(gameId) && Boolean(gameState) && gameState.id === gameId

  useEffect(() => {
    if (isValidGameSession) return
    navigate("/multiplay", { replace: true })
  }, [isValidGameSession, navigate])

  if (!isValidGameSession) return null

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      {/* motion.img: framer-motion이 제공하는, 애니메이션 속성이 붙은 img 태그.
          initial(시작 상태)의 opacity 0에서 animate(도착 상태)의 opacity 1로 바뀌며
          배경 이미지가 서서히 나타나는 페이드인 효과를 만듦 */}
      <motion.img
        src={publicAsset(INGAME_ASSETS.bg)}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BG_FADE_TRANSITION}
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      {/* 진입 연출이 떠 있는 동안에는 이 게임 표면 전체를 inert로 잠근다 — 포인터도 키보드
          초점도 안으로 들어가지 못하므로 낮 투표·채팅·재판·밤 행동·결과 컨트롤이 한꺼번에
          차단된다. 오버레이들은 이 래퍼 바깥에 있어 그대로 조작할 수 있다. */}
      <div
        className={`absolute inset-0 ${interactionBlocked ? "pointer-events-none" : ""}`.trim()}
        inert={interactionBlocked || undefined}
      >
        <InGameTopControls
          onExitClick={requestExit}
          onMenuClick={() => setPlayerRecordListOpen(true)}
        />
        <InGamePlayerSessionProvider>
          {/* NIGHT 문구는 canonical 턴이 아니라 연출 릴의 현재 역할(nightTurn.statusRole)에서
              파생한다 — 역할 보유자가 죽어도 그 역할의 상태바 문구가 사라지지 않아야 사망
              정보가 새지 않는다. */}
          <InGameTimebar
            day={gameState?.dayIndex}
            activePhaseId={mapGamePhaseToTimebarPhaseId(gameState?.phase)}
            statusMessage={selectInGameTimebarStatusMessage(gameState, nightTurn.statusRole)}
          />
          <InGamePlayerBoard />
          <InGameChatShell />
          <InGameActionPanel
            onOpenRoleReveal={roleReveal.reopen}
            roleRevealAvailable={Boolean(roleReveal.roleInfo)}
            interactionBlocked={interactionBlocked}
          />
          <PlayerRecordListPanel
            open={playerRecordListOpen}
            onClose={() => setPlayerRecordListOpen(false)}
          />
        </InGamePlayerSessionProvider>
      </div>

      {/* 오버레이는 우선순위가 낮은 것부터 그린다 — 실제 표시 순서는 렌더 순서가 아니라
          useInGameOverlayStack이 정한 hold 관계와 각자의 z 단계가 결정한다. */}
      <InGameNightTurnAnnouncementOverlay
        open={nightTurn.open}
        announcement={nightTurn.announcement}
        onClose={nightTurn.close}
      />
      <InGamePhaseEntranceOverlay
        open={phaseEntrance.open}
        phase={phaseEntrance.phase}
        onConfirm={phaseEntrance.confirm}
      />
      <InGameNightPrivateResultOverlay
        open={nightPrivateResult.open}
        kind={nightPrivateResult.kind}
        label={nightPrivateResult.label}
        onConfirm={nightPrivateResult.confirm}
      />
      <InGameKillRevealOverlay
        open={killReveal.open}
        revealId={killReveal.revealId}
        message={killReveal.message}
        onConsume={killReveal.consume}
      />
      <InGameRoleRevealOverlay
        open={roleReveal.open}
        onClose={roleReveal.close}
        roleInfo={roleReveal.roleInfo}
        players={gameState?.players}
      />
    </div>
  )
}