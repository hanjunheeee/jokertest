import { useMemo, useState } from "react"
import { getSocket } from "@/shared/socket/socketClient"
import {
  getInGameNightActionLabel,
  getInGameNightActionType,
  isSelfTargetAllowedForNightAction,
} from "../constants/actions/ingameActionPanel.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useInGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import { buildNightActionTargets } from "../utils/buildNightActionTargets.js"
import { useInGameNightActionSubmit } from "./useInGameNightActionSubmit.js"
import { useInGameResolveNight } from "./useInGameResolveNight.js"

function emitGameAction(eventName, payload = {}) {
  getSocket()?.emit(eventName, payload)
}

/** 개발용 인게임 조작 패널의 선택값과 소켓 이벤트 전송을 관리합니다. */
export function useInGameActionPanel() {
  const gameState = useInGameStore((s) => s.state)
  const error = useInGameStore((s) => s.error)

  // 투표/스킬 대상으로 선택한 플레이어 id입니다.
  const [selectedTargetId, setSelectedTargetId] = useState(null)

  const myRole = gameState?.self?.role
  const dayIndex = gameState?.dayIndex

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

  const latestEvents = useMemo(
    () => [...(gameState?.events ?? [])].slice(-6).reverse(),
    [gameState?.events],
  )

  const nightActionType = getInGameNightActionType(myRole, dayIndex)
  const nightActionLabel = getInGameNightActionLabel(myRole, dayIndex)
  const hasTarget = Boolean(selectedTargetId)

  const nightActionSubmit = useInGameNightActionSubmit()
  const resolveNightRequest = useInGameResolveNight()
  // 판정이 진행 중이거나(resolving) 이미 끝났으면(resolved) 밤 행동 입력·판정 버튼을 함께
  // 잠근다 — 판정 완료 후 재제출·중복 판정 요청을 막기 위함이다. phase !== 'NIGHT'도 함께
  // 검사한다 — DAY 전이로 resolveNightStatus가 'idle'로 초기화되더라도 NIGHT 조작은 계속
  // 잠겨 있어야 한다.
  const nightActionsLocked = resolveNightRequest.status !== "idle" || gameState?.phase !== "NIGHT"

  const submitDayVote = () => {
    emitGameAction("cast_day_vote", { targetId: selectedTargetId })
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
    nightActionSubmit.submit(selectedTargetId ?? null)
  }

  const skipNightAction = () => {
    nightActionSubmit.submit(null)
  }

  return {
    gameState,
    error,
    selectedTargetId,
    setSelectedTargetId,
    nightActionTargets,
    latestEvents,
    nightActionType,
    nightActionLabel,
    hasTarget,
    nightActionStatus: nightActionSubmit.status,
    nightActionError: nightActionSubmit.error,
    submitDayVote,
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
