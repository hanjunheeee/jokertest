import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { createTribunalVoteSubmitController } from "../utils/createTribunalVoteSubmitController.js"
import { INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE } from "../utils/computeTribunalVoteSubmitPatch.js"

const VALID_VOTES = new Set(["GUILTY", "NOT_GUILTY"])

/**
 * cast_tribunal_vote ack settle 시점에 controller가 참조할 "지금 이 순간의" 컨텍스트를 만든다.
 * gameId/dayIndex/phase/defendantUuid뿐 아니라 actor identity(state.self.uuid)와 그 참가자의
 * alive까지 전부 단일 useInGameStore.getState() 스냅샷에서 산출한다 — React가 이 hook을 아직
 * 리렌더하지 않은 구간(store 변경 ~ 다음 렌더 사이)에 ack가 settle되더라도 항상 최신 store 값을
 * 반영하기 위해서다. localPlayerId/alive를 React Context(participant snapshot)에서 받으면 store
 * 변경과 다음 렌더 사이의 stale 구간에서 이전 값을 쓰게 되므로, alive와 actor identity 모두
 * getState()가 반환한 state.self.uuid / state.players[].alive에서만 조회한다.
 */
export function buildLatestTribunalVoteContext() {
  const storeState = useInGameStore.getState()
  const latestGameId = storeState.gameId
  const latestPhase = storeState.state?.phase
  const latestDayIndex = storeState.state?.dayIndex
  const latestDefendantUuid = storeState.state?.tribunal?.defendantUuid
  const actorUuid = storeState.state?.self?.uuid
  const players = storeState.state?.players
  const selfPlayer = Array.isArray(players) ? players.find((player) => player?.uuid === actorUuid) : undefined
  const latestAlive = selfPlayer?.alive === true
  const latestIsDefendant = Boolean(actorUuid) && actorUuid === latestDefendantUuid

  return {
    gameId: latestGameId,
    dayIndex: latestDayIndex,
    phase: latestPhase,
    alive: latestAlive,
    isDefendant: latestIsDefendant,
    defendantUuid: latestDefendantUuid,
    actorUuid,
  }
}

/**
 * TRIBUNAL 유죄/무죄 투표 제출(cast_tribunal_vote)을 관리하는 얇은 배선 hook이다. 경쟁 조건
 * 방어 로직은 전부 createTribunalVoteSubmitController에 있고, 이 hook은 controller 생성/폐기,
 * React state 동기화, 무효화 트리거(unmount·socket 교체·disconnect·gameId/dayIndex/phase/생존/
 * 피고인/actor 변경)만 담당한다.
 *
 * getLatestContext는 buildLatestTribunalVoteContext를 통해 settle마다 useInGameStore.getState()를
 * 직접 호출한다(렌더 시점에 작성해 둔 ref를 반환하지 않는다) — 그래야 store가 바뀐 렌더와 이 hook이
 * 그 값을 반영해 다시 렌더되는 시점 사이의 stale 구간이 사라진다. alive/isDefendant도 React
 * Context가 아니라 store의 state.self.uuid / state.players[].alive에서 직접 산출한다.
 */
export function useInGameTribunalVoteSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid)
  const actorUuid = useInGameStore((s) => s.state?.self?.uuid)
  const alive = useInGameStore((s) => {
    const uuid = s.state?.self?.uuid
    const players = s.state?.players
    const player = Array.isArray(players) ? players.find((p) => p?.uuid === uuid) : undefined
    return player?.alive === true
  })
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const isDefendant = Boolean(actorUuid) && actorUuid === defendantUuid

  const [state, setState] = useState(INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE)
  const controllerRef = useRef(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // socket 하나당 controller 하나 — socket이 바뀌면 이전 controller를 dispose()하고 새로 만든다.
  useEffect(() => {
    const controller = createTribunalVoteSubmitController({
      getSocket,
      onStateChange: (next) => {
        if (isMountedRef.current) setState(next)
      },
      getLatestContext: () => buildLatestTribunalVoteContext(),
    })
    controllerRef.current = controller
    setState(controller.getState())

    return () => {
      controller.dispose()
      controllerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  // gameId/dayIndex/phase/생존/피고인/actor 변경 시 진행 중 요청·표시 상태를 무효화한다.
  // isDefendant는 로컬 플레이어가 피고인인지 여부만 담아 피고인이 A→B로 바뀌어도 로컬 플레이어가
  // 둘 다 아니면 불변일 수 있으므로, defendantUuid/actorUuid 원본도 별도 의존성으로 둬 그 전환을
  // 놓치지 않는다.
  useEffect(() => {
    controllerRef.current?.invalidate("CONTEXT_CHANGE")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, dayIndex, phase, alive, isDefendant, defendantUuid, actorUuid])

  // disconnect 시 무효화 — 재연결 후 새 socket effect가 새 controller를 만든다.
  useEffect(() => {
    if (!socket) return undefined
    const handleDisconnect = () => controllerRef.current?.invalidate("DISCONNECT")
    socket.on("disconnect", handleDisconnect)
    return () => {
      socket.off("disconnect", handleDisconnect)
    }
  }, [socket])

  // actorUuid(위 55행)는 React 렌더 시점의 selector 값이라 self가 바뀐 뒤 다음 리렌더 전에
  // 이 클로저가 호출되면 이전 actor를 요청 컨텍스트로 캡처하게 된다. "누가 제출하는가"는
  // UI가 보여준 값이 아니라 항상 지금 이 순간의 canonical identity여야 하므로, 여기서만
  // useInGameStore.getState()를 직접 호출해 호출 시점의 state.self.uuid를 동기 캡처한다
  // (gameId/dayIndex/defendantUuid는 사용자가 화면에서 본 값을 그대로 요청에 담는 것이 맞으므로
  // 렌더 값을 유지한다).
  const submitTribunalVote = (vote) => {
    if (!VALID_VOTES.has(vote)) return
    if (state.status !== "idle") return
    const canonicalActorUuid = useInGameStore.getState().state?.self?.uuid
    controllerRef.current?.submit({ gameId, dayIndex, vote, defendantUuid, actorUuid: canonicalActorUuid })
  }

  return {
    status: state.status,
    submittedVote: state.submittedVote,
    error: state.error,
    alive,
    isDefendant,
    submitTribunalVote,
  }
}
