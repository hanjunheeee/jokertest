import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { getInGamePhaseEntranceMessage } from "../constants/phaseEntrance/ingamePhaseEntrance.js"
import {
  buildInGamePhaseEntranceIdentity,
  buildInGamePhaseEntranceScope,
} from "../utils/buildInGamePhaseEntranceIdentity.js"
import { getInGameSocketEpochId } from "../utils/getInGameSocketEpochId.js"
import {
  confirmInGamePhaseEntrance,
  INITIAL_IN_GAME_PHASE_ENTRANCE,
  reduceInGamePhaseEntrance,
} from "../utils/reduceInGamePhaseEntrance.js"

/**
 * DAY/NIGHT 진입 연출("낮이 되었습니다" / "밤이 되었습니다")의 표시 상태를 관리한다.
 *
 * useInGameRoleReveal·useInGameNightTurnAnnouncement와 같은 원칙으로 완전히 로컬 UI 상태다 —
 * socket emit(acknowledge_role_reveal 포함)·REST·canonical store 변경이 전혀 없고, 새 소켓
 * 이벤트도 새 canonical phase도 만들지 않는다. 닫아도 서버의 phase·역할 턴은 움직이지 않는다.
 *
 * 무엇을 언제 보여줄지는 전부 순수 함수 reduceInGamePhaseEntrance가 결정한다 — 이 훅은
 * canonical 입력(계정 uuid·gameId·phase·dayIndex·소켓 세대)과 상위 오버레이 여부(hold)를
 * 모아서 넘기고, 결과를 그대로 노출하기만 한다.
 *
 * 하이드레이션 구분:
 *   재접속 스냅샷(get_session_snapshot)으로 이미 진행 중인 낮/밤에 복원되는 것은 "방금 전이"가
 *   아니므로 연출하지 않는다. 그 판별은 소켓 리스너 등록 순서에 의존하지 않고 store의
 *   snapshotSeq(스냅샷이 실제로 반영될 때만 오르는 단조 카운터)로만 한다.
 *
 * @param {object} [options]
 * @param {boolean} [options.hold] 더 높은 우선순위 오버레이(자기 역할 공개, 사망 연출)가 떠
 *   있는가. true인 동안에는 연출을 띄우지 않되 "소비됨"으로도 처리하지 않는다 — 상위
 *   오버레이가 닫히는 즉시 반드시 뜬다.
 */
export function useInGamePhaseEntrance({ hold = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase ?? null)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex ?? null)
  const snapshotSeq = useInGameStore((s) => s.snapshotSeq)
  const authUuid = useAuthStore((s) => s.user?.uuid ?? null)
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 실제 "connect"는 최초 연결이든 재연결이든 항상 새 세대다(useInGameSessionSnapshotSync의
  // 판단과 동일). socket 참조는 그대로인 채 재연결만 일어나는 경우까지 세대로 잡아낸다.
  const [connectSeq, setConnectSeq] = useState(0)
  useEffect(() => {
    if (!socket) return undefined
    const handleConnect = () => setConnectSeq((current) => current + 1)
    socket.on("connect", handleConnect)
    return () => socket.off("connect", handleConnect)
  }, [socket])

  const epochKey = `${getInGameSocketEpochId(socket)}#${connectSeq}`
  const scope = buildInGamePhaseEntranceScope({ gameId, authUuid, epochKey })
  const identity = buildInGamePhaseEntranceIdentity(scope, phase, dayIndex)

  const [presentation, setPresentation] = useState(INITIAL_IN_GAME_PHASE_ENTRANCE)
  const lastSnapshotSeqRef = useRef(snapshotSeq)

  useEffect(() => {
    const hydrated = lastSnapshotSeqRef.current !== snapshotSeq
    lastSnapshotSeqRef.current = snapshotSeq
    // reduceInGamePhaseEntrance는 바뀐 것이 없으면 같은 참조를 돌려주므로, StrictMode의
    // setup 이중 실행이나 동일 입력의 반복 관측은 리렌더조차 만들지 않는다.
    setPresentation((current) =>
      reduceInGamePhaseEntrance(current, { scope, identity, phase, dayIndex, hold, hydrated }),
    )
    // phase/dayIndex는 identity에 이미 녹아 있으므로 deps에서 제외한다 — identity가 같은데
    // phase/dayIndex만 달라지는 경우는 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, identity, hold, snapshotSeq])

  const activeIdentity = presentation.active?.identity ?? null
  const activePhase = presentation.active?.phase ?? null

  // 확인 콜백은 자기가 만들어진 시점의 identity를 캡슐화한다 — 이전 낮/밤·이전 게임·이전
  // 소켓 세대의 늦은 확인은 identity 불일치로 아무 일도 하지 않는다(새로 뜬 연출을 대신
  // 닫아버리지 않는다).
  const confirm = useCallback(() => {
    setPresentation((current) => confirmInGamePhaseEntrance(current, activeIdentity))
  }, [activeIdentity])

  return {
    open: presentation.active !== null,
    phase: activePhase,
    dayIndex: presentation.active?.dayIndex ?? null,
    message: getInGamePhaseEntranceMessage(activePhase),
    identity: activeIdentity,
    confirm,
    // 아직 띄우지 못하고 대기 중인 연출이 있는가 — 밤 역할 턴 안내처럼 "진입 연출 다음"에
    // 와야 하는 화면이 이 값으로 자기 차례를 기다린다.
    armed: presentation.pending !== null || presentation.active !== null,
    // 지금 연출이 실제로 화면을 덮고 있는가 — 아래 게임 표면의 입력을 잠그는 기준이다.
    blocking: presentation.active !== null,
  }
}
