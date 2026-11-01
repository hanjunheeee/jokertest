// 재판 투표 제출 훅: 컨트롤러로 유죄·무죄 보내기, 받아들여지면 제출 효과음
// 행동 패널 훅이 사용 (카드 메뉴는 행동 컨텍스트로 씀), 끊김 받기는 socket/connection.js를 부름
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { dispatchSfxEvent } from "../../../../shared/hooks/useSfxRuntime.js"
import { createTribunalVoteSubmitController } from "../utils/createTribunalVoteSubmitController.js"
import { INITIAL_TRIBUNAL_VOTE_SUBMIT_STATE } from "../utils/voteSubmitPatch.js"
import { onDisconnect } from "../socket/connection.js"

// 낼 수 있는 표
const VALID_VOTES = new Set(["GUILTY", "NOT_GUILTY"])

// 제출 효과음: 보낸 판·날짜·본인이 그대로이고 재판 중일 때만
function playSubmitSfx(sfxEvent, requestScope) {
  // 효과음 사건이 보낸 판·날짜 것인지
  if (sfxEvent === null || typeof sfxEvent !== "object") return
  if (sfxEvent.gameId !== requestScope.gameId) return
  if (sfxEvent.dayIndex !== requestScope.dayIndex) return

  // 로그인한 내 효과음인지
  const { user, isLoggedIn } = useAuthStore.getState()
  const accountId = isLoggedIn && user?.uuid ? user.uuid : null
  if (accountId === null) return
  if (sfxEvent.accountId !== accountId) return

  // 아직 같은 판·같은 날 재판이고 판 속 나도 같은 계정인지
  const latest = useInGameStore.getState()
  if (latest.gameId !== requestScope.gameId) return
  if (latest.state?.dayIndex !== requestScope.dayIndex) return
  if (latest.state?.phase !== "TRIBUNAL") return
  if (latest.state?.self?.uuid !== accountId) return

  dispatchSfxEvent({
    kind: "tribunal-vote-submitted",
    eventId: sfxEvent.eventId,
    accountId,
    gameId: requestScope.gameId,
    origin: sfxEvent.origin,
  })
}

// 스토어의 지금 값으로 재판 투표 범위 만들기 (컨트롤러가 응답 때 비교)
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

// 재판 투표 상태·내 생존·피고 여부와 투표 함수
export function useInGameTribunalVoteSubmit() {
  const gameId = useInGameStore((s) => s.gameId)
  const phase = useInGameStore((s) => s.state?.phase)
  const dayIndex = useInGameStore((s) => s.state?.dayIndex)
  const defendantUuid = useInGameStore((s) => s.state?.tribunal?.defendantUuid)
  const actorUuid = useInGameStore((s) => s.state?.self?.uuid)
  // 내가 살아 있는지 (판 사람 목록 기준)
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

  // 화면 빠진 뒤엔 상태 안 바꾸게 표시
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // 소켓마다 제출 컨트롤러 하나 (응답 때 스토어 지금 값과 비교, 소켓 바뀌면 옛 것 버림)
  useEffect(() => {
    const controller = createTribunalVoteSubmitController({
      getSocket,
      onStateChange: (next) => {
        if (isMountedRef.current) setState(next)
      },
      getLatestContext: () => buildLatestTribunalVoteContext(),
      onAccepted: playSubmitSfx,
    })
    controllerRef.current = controller
    setState(controller.getState())

    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [socket])

  // 판·날짜·단계·생존·피고·내가 바뀌면 진행 중 제출 버림
  useEffect(() => {
    controllerRef.current?.invalidate("CONTEXT_CHANGE")
  }, [gameId, dayIndex, phase, alive, isDefendant, defendantUuid, actorUuid])

  // 연결 끊기면 진행 중 제출 버림
  useEffect(() => {
    if (!socket) return undefined
    const offDisconnect = onDisconnect(socket, () => controllerRef.current?.invalidate("DISCONNECT"))
    return () => {
      offDisconnect()
    }
  }, [socket])

  // 유죄·무죄만, 보내는 중이거나 이미 냈으면 막기 (나는 스토어 지금 값)
  const submitTribunalVote = (vote) => {
    if (!VALID_VOTES.has(vote)) return
    if (state.status !== "idle") return
    const canonicalActorUuid = useInGameStore.getState().state?.self?.uuid
    controllerRef.current?.submit({ gameId, dayIndex, vote, defendantUuid, actorUuid: canonicalActorUuid })
  }

  // 서버가 진행 수·제출 여부를 주면 그 값을 먼저 씀
  const serverProgress = useInGameStore((s) => s.state?.progress ?? null)
  const serverHasSubmitted = useInGameStore((s) => s.state?.self?.hasSubmittedTribunalVote)
  const serverOwnsProgress = serverProgress?.kind === "TRIBUNAL"

  return {
    status: state.status,
    submittedVote: state.submittedVote,
    error: state.error,
    alive,
    isDefendant,
    hasSubmitted: typeof serverHasSubmitted === "boolean"
      ? serverHasSubmitted
      : state.submittedVote !== null,
    voteCount: serverOwnsProgress ? serverProgress.doneCount : null,
    requiredCount: serverOwnsProgress ? serverProgress.requiredCount : null,
    submitTribunalVote,
  }
}
