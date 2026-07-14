import { useMemo, useState } from "react"
import { getSocket } from "@/shared/socket/socketClient"
import {
  getInGameNightActionLabel,
  getInGameNightActionType,
} from "../constants/actions/ingameActionPanel.js"
import { useInGameStore } from "../store/ingameStore.js"

function emitGameAction(eventName, payload = {}) {
  getSocket()?.emit(eventName, payload)
}

/** 개발용 인게임 조작 패널의 선택값과 소켓 이벤트 전송을 관리합니다. */
export function useInGameActionPanel() {
  const gameState = useInGameStore((s) => s.state)
  const error = useInGameStore((s) => s.error)

  // 투표/스킬 대상으로 선택한 플레이어 id입니다.
  const [selectedTargetId, setSelectedTargetId] = useState(null)

  const alivePlayers = useMemo(
    () => gameState?.players?.filter((player) => player.alive && player.connected) ?? [],
    [gameState?.players],
  )

  const latestEvents = useMemo(
    () => [...(gameState?.events ?? [])].slice(-6).reverse(),
    [gameState?.events],
  )

  const nightActionType = getInGameNightActionType(gameState?.myRole)
  const nightActionLabel = getInGameNightActionLabel(gameState?.myRole)
  const hasTarget = Boolean(selectedTargetId)

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
    emitGameAction("submit_night_action", {
      action:
        nightActionType === "SKIP"
          ? { type: "SKIP" }
          : { type: nightActionType, targetId: selectedTargetId },
    })
  }

  const resolveNight = () => {
    emitGameAction("resolve_night")
  }

  return {
    gameState,
    error,
    selectedTargetId,
    setSelectedTargetId,
    alivePlayers,
    latestEvents,
    nightActionType,
    nightActionLabel,
    hasTarget,
    submitDayVote,
    resolveDayVote,
    submitTribunalVote,
    resolveTribunalVote,
    submitNightAction,
    resolveNight,
  }
}
