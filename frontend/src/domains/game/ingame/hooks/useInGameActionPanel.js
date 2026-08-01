import { useEffect, useMemo, useState } from "react"
import { getSocket } from "@/shared/socket/socketClient"
import {
  getInGameNightActionLabel,
  getInGameNightActionType,
  isSelfTargetAllowedForNightAction,
} from "../constants/actions/ingameActionPanel.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useInGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import { buildNightActionTargets } from "../utils/buildNightActionTargets.js"
import { buildDayVoteTargets, isSessionPlayerAlive } from "../utils/buildDayVoteTargets.js"
import { useInGameNightActionSubmit } from "./useInGameNightActionSubmit.js"
import { useInGameDayVoteSubmit } from "./useInGameDayVoteSubmit.js"
import { useInGameResolveNight } from "./useInGameResolveNight.js"

function emitGameAction(eventName, payload = {}) {
  getSocket()?.emit(eventName, payload)
}

/** 개발용 인게임 조작 패널의 선택값과 소켓 이벤트 전송을 관리합니다. */
export function useInGameActionPanel() {
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const error = useInGameStore((s) => s.error)

  // NIGHT 대상으로 선택한 플레이어 id입니다(DAY 투표 선택과는 별개 상태 — 서로 오염되지
  // 않도록 분리되어 있습니다).
  const [selectedNightTargetId, setSelectedNightTargetId] = useState(null)
  // DAY 투표 대상으로 선택한 플레이어 id입니다.
  const [selectedDayVoteTargetId, setSelectedDayVoteTargetId] = useState(null)

  const myRole = gameState?.self?.role
  const dayIndex = gameState?.dayIndex

  // 새 게임 또는 다음 dayIndex로 전환하면 이전 DAY의 선택값이 새 컨텍스트로 새어나가지
  // 않게 선택만 초기화합니다(제출 상태 리셋은 useInGameDayVoteSubmit의 controller가 담당).
  useEffect(() => {
    setSelectedDayVoteTargetId(null)
  }, [gameId, dayIndex])

  // NIGHT 대상 선택 목록입니다. gameState.players({uuid,nickname})를 InGameTargetPicker에
  // 직접 넘기면 안 됩니다 — 그 컴포넌트는 {id,name,alive,connected}를 기대하므로 항상
  // "연결끊김"으로 비활성화됩니다(id/name/alive/connected가 전부 undefined). 보드·채팅·
  // 투표현황 등 다른 화면과 동일하게 useInGamePlayerSessionContext()가 이미 변환해 둔
  // {id,nickname,status}를 재사용해 어댑터(buildNightActionTargets)로 형태만 맞춥니다 —
  // 새 alive 시스템이 아니라 기존 status 계산을 재사용하는 것입니다.
  const { players: sessionPlayers, localPlayerId } = useInGamePlayerSessionContext()
  const nightActionTargets = useMemo(
    () =>
      buildNightActionTargets(sessionPlayers, {
        localPlayerId,
        selfTargetAllowed: isSelfTargetAllowedForNightAction(myRole),
      }),
    [sessionPlayers, localPlayerId, myRole],
  )

  // DAY 투표 대상 목록입니다 — buildNightActionTargets와 달리 role/isAlly를 읽지 않으므로
  // 살아있는 동료 JOKER도 항상 선택 가능한 대상으로 남습니다.
  const dayVoteTargets = useMemo(
    () => buildDayVoteTargets(sessionPlayers, { localPlayerId }),
    [sessionPlayers, localPlayerId],
  )
  const localSessionPlayer = sessionPlayers?.find((player) => player.id === localPlayerId)
  const dayVoteControlsEnabled = gameState?.phase === "DAY" && isSessionPlayerAlive(localSessionPlayer)

  const latestEvents = useMemo(
    () => [...(gameState?.events ?? [])].slice(-6).reverse(),
    [gameState?.events],
  )

  const nightActionType = getInGameNightActionType(myRole, dayIndex)
  const nightActionLabel = getInGameNightActionLabel(myRole, dayIndex)
  const hasTarget = Boolean(selectedNightTargetId)

  const nightActionSubmit = useInGameNightActionSubmit()
  const dayVoteSubmit = useInGameDayVoteSubmit()
  const resolveNightRequest = useInGameResolveNight()
  // 판정이 진행 중이거나(resolving) 이미 끝났으면(resolved) 밤 행동 입력·판정 버튼을 함께
  // 잠근다 — 판정 완료 후 재제출·중복 판정 요청을 막기 위함이다. phase !== 'NIGHT'도 함께
  // 검사한다 — DAY 전이로 resolveNightStatus가 'idle'로 초기화되더라도 NIGHT 조작은 계속
  // 잠겨 있어야 한다.
  const nightActionsLocked = resolveNightRequest.status !== "idle" || gameState?.phase !== "NIGHT"

  const submitDayVote = () => {
    if (!selectedDayVoteTargetId) return
    dayVoteSubmit.submitDayVote(selectedDayVoteTargetId)
  }

  const abstainDayVote = () => {
    dayVoteSubmit.submitDayVote(null)
  }

  const resolveDayVote = () => {
    emitGameAction("resolve_day_vote")
  }

  const submitTribunalVote = (vote) => {
    emitGameAction("cast_tribunal_vote", { vote })
  }

  const resolveTribunalVote = () => {
    emitGameAction("resolve_tribunal_vote")
  }

  const submitNightAction = () => {
    nightActionSubmit.submit(selectedNightTargetId ?? null)
  }

  const skipNightAction = () => {
    nightActionSubmit.submit(null)
  }

  return {
    gameState,
    error,
    selectedNightTargetId,
    setSelectedNightTargetId,
    nightActionTargets,
    latestEvents,
    nightActionType,
    nightActionLabel,
    hasTarget,
    nightActionStatus: nightActionSubmit.status,
    nightActionError: nightActionSubmit.error,
    selectedDayVoteTargetId,
    setSelectedDayVoteTargetId,
    dayVoteTargets,
    dayVoteControlsEnabled,
    submitDayVote,
    abstainDayVote,
    dayVoteStatus: dayVoteSubmit.status,
    dayVoteError: dayVoteSubmit.error,
    dayVoteHasSubmitted: dayVoteSubmit.hasSubmitted,
    dayVoteLastSubmittedTargetId: dayVoteSubmit.lastSubmittedTargetId,
    resolveDayVote,
    submitTribunalVote,
    resolveTribunalVote,
    submitNightAction,
    skipNightAction,
    nightActionsLocked,
    resolveNight: resolveNightRequest.resolveNight,
    resolveNightStatus: resolveNightRequest.status,
    resolveNightError: resolveNightRequest.error,
    nightActionResult: resolveNightRequest.nightActionResult,
  }
}
